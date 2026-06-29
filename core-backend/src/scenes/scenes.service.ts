import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import type { VideoStoryboard, StoryboardScene } from "../storyboard/video-storyboard";

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
