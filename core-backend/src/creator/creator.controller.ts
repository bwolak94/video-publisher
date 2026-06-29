import { Controller, Post, Body, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import pino from "pino";
import { configuration } from "../config/configuration";
import { ProjectsService } from "../projects/projects.service";

const logger = pino({ level: "info" });

interface OutlineBody {
  topic?: string;
  message?: string;
  language?: string;
  voiceId?: string;
  projectId?: string;
}

interface StoryboardBody {
  outline: string[];
  language?: string;
  voiceId?: string;
  projectId?: string;
  sceneCount?: number;
  targetDurationSeconds?: number;
  aspectRatio?: string;
}

@Controller("api/creator")
export class CreatorController {
  private readonly aiBackendUrl: string;

  constructor(private readonly projectsService: ProjectsService) {
    this.aiBackendUrl = configuration().worker.aiBackendUrl;
  }

  @Post("outline")
  async outline(@Body() body: OutlineBody, @Res() reply: FastifyReply): Promise<void> {
    const topic = body.topic ?? body.message ?? "";

    logger.info({ topic, language: body.language }, "Proxying creator outline to ai-backend");

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          language: body.language ?? "en",
          voiceId: body.voiceId ?? "default",
          projectId: body.projectId ?? null,
        }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for creator outline");
      reply.code(503).send({ error: "AI backend unavailable" });
      return;
    }

    if (!aiRes.ok || !aiRes.body) {
      const text = await aiRes.text().catch(() => "");
      logger.error({ status: aiRes.status, text }, "ai-backend outline error");
      reply.code(aiRes.status).send({ error: text || "AI backend error" });
      return;
    }

    reply.raw.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "http://localhost:3000");
    reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
    reply.raw.setHeader("Content-Type", "text/plain; charset=utf-8");
    reply.raw.setHeader("Transfer-Encoding", "chunked");

    const reader = aiRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(Buffer.from(value));
      }
    } finally {
      reply.raw.end();
    }
  }

  @Post("storyboard")
  async storyboard(@Body() body: StoryboardBody): Promise<unknown> {
    logger.info({ outlineLength: body.outline?.length }, "Proxying creator storyboard to ai-backend");

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline: body.outline ?? [],
          language: body.language ?? "en",
          voiceId: body.voiceId ?? "default",
          projectId: body.projectId ?? null,
          sceneCount: body.sceneCount ?? 8,
          targetDurationSeconds: body.targetDurationSeconds ?? 40,
          aspectRatio: body.aspectRatio ?? "16:9",
        }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for creator storyboard");
      throw new Error("AI backend unavailable");
    }

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      logger.error({ status: aiRes.status, text }, "ai-backend storyboard error");
      throw new Error(`AI backend error: ${text}`);
    }

    const data = await aiRes.json() as { storyboard: Record<string, unknown>; projectId: string };

    // Save the project + storyboard to the DB so scene endpoints can look them up
    const title = (data.storyboard?.meta as any)?.title ?? "Untitled";
    const project = await this.projectsService.createWithStoryboard(title, data.storyboard);

    logger.info({ projectId: project.id, scenes: (data.storyboard?.timeline as any[])?.length }, "Project saved to DB");

    return { storyboard: data.storyboard, projectId: project.id };
  }
}
