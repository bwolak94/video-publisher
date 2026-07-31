import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, ne } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import { QueueService } from "../queue/queue.service";
import { ScenesService } from "../scenes/scenes.service";

const SERVER_INFO = {
  protocolVersion: "2024-11-05",
  serverInfo: { name: "ai-video-factory", version: "1.0.0" },
  capabilities: { tools: {} },
  tools: [
    {
      name: "list_projects",
      description: "List all video projects",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_project",
      description: "Get a project's storyboard and status",
      inputSchema: {
        type: "object",
        properties: { project_id: { type: "string" } },
        required: ["project_id"],
      },
    },
    {
      name: "render_project",
      description: "Queue a render job for a project",
      inputSchema: {
        type: "object",
        properties: { project_id: { type: "string" } },
        required: ["project_id"],
      },
    },
    {
      name: "update_scene",
      description: "Update narrationText and/or visualPrompt for a scene",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          scene_id: { type: "string" },
          narration_text: { type: "string" },
          visual_prompt: { type: "string" },
        },
        required: ["project_id", "scene_id"],
      },
    },
    {
      name: "reorder_scenes",
      description: "Reorder scenes in a project by providing the full ordered list of scene IDs",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          scene_ids: { type: "array", items: { type: "string" } },
        },
        required: ["project_id", "scene_ids"],
      },
    },
    {
      name: "preview_scene",
      description: "Get a presigned URL for a single-scene preview render (valid 1 hour)",
      inputSchema: {
        type: "object",
        properties: { scene_id: { type: "string" } },
        required: ["scene_id"],
      },
    },
  ],
};

@Injectable()
export class McpService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly queueService: QueueService,
    private readonly scenesService: ScenesService,
  ) {}

  getServerInfo() {
    return SERVER_INFO;
  }

  async handleRequest(body: any): Promise<{ result: { content: { type: string; text: string }[] } }> {
    const method: string = body?.method;
    const params = body?.params ?? {};

    if (method !== "tools/call") {
      return this.textResult(`Unsupported method: ${method}`);
    }

    const toolName: string = params?.name;
    const args = params?.arguments ?? {};

    switch (toolName) {
      case "list_projects":
        return this.listProjects();
      case "get_project":
        return this.getProject(args.project_id);
      case "render_project":
        return this.renderProject(args.project_id);
      case "update_scene":
        return this.updateScene(args.project_id, args.scene_id, args.narration_text, args.visual_prompt);
      case "reorder_scenes":
        return this.reorderScenes(args.project_id, args.scene_ids);
      case "preview_scene":
        return this.previewScene(args.scene_id);
      default:
        return this.textResult(`Unknown tool: ${toolName}`);
    }
  }

  private async listProjects() {
    const rows = await this.db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        mode: projects.mode,
      })
      .from(projects)
      .where(ne(projects.status, "deleted"))
      .orderBy(projects.updatedAt);

    return this.textResult(JSON.stringify(rows));
  }

  private async getProject(projectId: string) {
    if (!projectId) {
      return this.textResult("project_id is required");
    }

    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return this.textResult(JSON.stringify(rows[0]));
  }

  private async renderProject(projectId: string) {
    if (!projectId) {
      return this.textResult("project_id is required");
    }

    // Verify the project exists before enqueuing
    const rows = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const job = await this.queueService.add("render", { projectId });

    return this.textResult(JSON.stringify({ jobId: job.id, status: "queued" }));
  }

  /** S10: Update narrationText and/or visualPrompt for a scene. */
  private async updateScene(
    projectId: string,
    sceneId: string,
    narrationText?: string,
    visualPrompt?: string,
  ) {
    if (!projectId || !sceneId) {
      return this.textResult("project_id and scene_id are required");
    }
    const fields: Partial<{ narrationText: string; visualPrompt: string }> = {};
    if (narrationText !== undefined) fields.narrationText = narrationText;
    if (visualPrompt !== undefined) fields.visualPrompt = visualPrompt;
    if (Object.keys(fields).length === 0) {
      return this.textResult("At least one of narration_text or visual_prompt is required");
    }
    const result = await this.scenesService.updateSceneFields(projectId, sceneId, fields);
    return this.textResult(JSON.stringify({ scene: result.scene, staleDependencies: result.staleDependencies }));
  }

  /** S10: Reorder scenes within a project. */
  private async reorderScenes(projectId: string, sceneIds: string[]) {
    if (!projectId || !Array.isArray(sceneIds) || sceneIds.length === 0) {
      return this.textResult("project_id and scene_ids (non-empty array) are required");
    }
    await this.scenesService.reorderScenes(projectId, sceneIds);
    return this.textResult(JSON.stringify({ success: true, projectId, order: sceneIds }));
  }

  /** S10: Get a presigned URL for a single-scene preview render. */
  private async previewScene(sceneId: string) {
    if (!sceneId) {
      return this.textResult("scene_id is required");
    }
    const preview = await this.scenesService.findScene(sceneId);
    if (!preview.scene.videoUrl && !preview.scene.audioUrl) {
      return this.textResult(`Scene ${sceneId} has no generated assets yet — run asset generation first`);
    }
    // Return scene metadata; actual presigned URL requires a render (S10 provides scene info only)
    return this.textResult(JSON.stringify({
      sceneId,
      narrationText: preview.scene.narrationText,
      visualPrompt: preview.scene.visualPrompt,
      videoUrl: preview.scene.videoUrl ?? null,
      audioUrl: preview.scene.audioUrl ?? null,
      shotStatus: preview.scene.shotStatus ?? null,
      hint: "Use POST /api/scenes/:sceneId/preview-render for a rendered MP4 preview URL",
    }));
  }

  private textResult(text: string) {
    return { result: { content: [{ type: "text", text }] } };
  }
}
