import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { projects, sceneAssetHistory } from "../db/schema";
import type { VideoStoryboard, StoryboardScene, SubtitleTrack } from "../storyboard/video-storyboard";
import { WaveformService } from "./waveform.service";
import { S3Service } from "../storage/s3.service";

@Injectable()
export class ScenesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly waveform: WaveformService,
    private readonly s3: S3Service,
  ) {}

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

    // I6: Record old URL in history before overwriting
    const existing = storyboard.timeline.find((s) => s.sceneId === sceneId);
    if (existing?.videoUrl) {
      await this.recordAssetHistory(projectId, sceneId, "videoUrl", existing.videoUrl);
    }

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

    // I6: Record old audio URL in history
    const existing = storyboard.timeline.find((s) => s.sceneId === sceneId);
    if (existing?.audioUrl) {
      await this.recordAssetHistory(projectId, sceneId, "audioUrl", existing.audioUrl);
    }

    // I9: Auto-fit durationInSeconds from actual audio length
    let durationInSeconds: number | undefined;
    try {
      const presignedUrl = await this.s3.getPresignedUrl(
        audioUrl.startsWith("s3://") ? audioUrl.slice("s3://".length).split("/").slice(1).join("/") : audioUrl,
        300,
      );
      const waveformData = await this.waveform.extract(presignedUrl);
      if (waveformData.durationSeconds > 0) {
        durationInSeconds = waveformData.durationSeconds;
      }
    } catch { /* non-fatal — duration stays unchanged */ }

    const updated = {
      ...storyboard,
      timeline: storyboard.timeline.map((s) =>
        s.sceneId === sceneId
          ? { ...s, audioUrl, ...(durationInSeconds !== undefined ? { durationInSeconds } : {}) }
          : s
      ),
    };

    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  /** I6: Get asset history for a scene (latest first). */
  async getAssetHistory(projectId: string, _sceneId: string) {
    return this.db
      .select()
      .from(sceneAssetHistory)
      .where(eq(sceneAssetHistory.projectId, projectId))
      .orderBy(sceneAssetHistory.replacedAt);
  }

  /**
   * I7: Reorder scenes by updating their sequenceNumber.
   * `sceneIds` must contain all scene IDs in the desired order.
   */
  async reorderScenes(projectId: string, sceneIds: string[]): Promise<void> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const project = rows[0];
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const storyboard = project.storyboard as VideoStoryboard;
    const sceneMap = new Map(storyboard.timeline.map((s) => [s.sceneId, s]));

    const reordered = sceneIds.map((id, index) => {
      const scene = sceneMap.get(id);
      if (!scene) throw new NotFoundException(`Scene ${id} not found in project ${projectId}`);
      return { ...scene, sequenceNumber: index + 1 };
    });

    const updated = { ...storyboard, timeline: reordered };
    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async recordAssetHistory(projectId: string, sceneId: string, field: string, previousUrl: string): Promise<void> {
    await this.db
      .insert(sceneAssetHistory)
      .values({ projectId, sceneId, field, previousUrl })
      .catch(() => {}); // non-fatal
  }
}
