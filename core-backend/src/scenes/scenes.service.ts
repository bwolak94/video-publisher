import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import type { VideoStoryboard, StoryboardScene, SubtitleTrack } from "../storyboard/video-storyboard";

@Injectable()
export class ScenesService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async findScene(sceneId: string): Promise<{ project: any; scene: StoryboardScene }> {
    const allProjects = await this.db.select().from(projects);

    for (const project of allProjects) {
      const storyboard = project.storyboard as VideoStoryboard | null;
      if (!storyboard?.timeline) continue;
      const scene = storyboard.timeline.find((s) => s.sceneId === sceneId);
      if (scene) return { project, scene };
    }

    throw new NotFoundException(`Scene ${sceneId} not found`);
  }

  async updateSceneVideoUrl(projectId: string, sceneId: string, videoUrl: string, videoProvider?: string): Promise<void> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const project = rows[0];
    if (!project) return;

    const storyboard = project.storyboard as VideoStoryboard;
    const updated = {
      ...storyboard,
      timeline: storyboard.timeline.map((s) =>
        s.sceneId === sceneId
          ? { ...s, videoUrl, ...(videoProvider ? { videoProvider } : {}) }
          : s
      ),
    };

    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  async updateSceneSubtitles(projectId: string, sceneId: string, subtitleTrack: SubtitleTrack): Promise<void> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const project = rows[0];
    if (!project) return;

    const storyboard = project.storyboard as VideoStoryboard;
    const updated = {
      ...storyboard,
      timeline: storyboard.timeline.map((s) =>
        s.sceneId === sceneId ? { ...s, subtitleTrack } : s
      ),
    };

    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  /**
   * Patch arbitrary text fields on a scene (narrationText, visualPrompt, textOverlay).
   * Does NOT regenerate audio or video — caller is responsible for that.
   */
  async updateSceneFields(
    projectId: string,
    sceneId: string,
    fields: Partial<Pick<StoryboardScene, "narrationText" | "visualPrompt">>,
  ): Promise<StoryboardScene> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const project = rows[0];
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const storyboard = project.storyboard as VideoStoryboard;
    const sceneIndex = storyboard.timeline.findIndex((s) => s.sceneId === sceneId);
    if (sceneIndex === -1) throw new NotFoundException(`Scene ${sceneId} not found`);

    const updatedScene: StoryboardScene = { ...storyboard.timeline[sceneIndex], ...fields, isDirty: true };
    const updated = {
      ...storyboard,
      timeline: storyboard.timeline.map((s) => (s.sceneId === sceneId ? updatedScene : s)),
    };

    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return updatedScene;
  }

  async updateSceneAudioUrl(projectId: string, sceneId: string, audioUrl: string): Promise<void> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const project = rows[0];
    if (!project) return;

    const storyboard = project.storyboard as VideoStoryboard;
    const updated = {
      ...storyboard,
      timeline: storyboard.timeline.map((s) =>
        s.sceneId === sceneId ? { ...s, audioUrl } : s
      ),
    };

    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }
}
