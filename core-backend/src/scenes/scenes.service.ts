import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DRIZZLE } from "../db/db.module";
import { projects, sceneAssetHistory } from "../db/schema";
import type { VideoStoryboard, StoryboardScene, SubtitleTrack } from "../storyboard/video-storyboard";
import { WaveformService } from "./waveform.service";
import { S3Service } from "../storage/s3.service";

/** I5: Find the last sentence boundary at or before `maxLen` characters. */
function splitAtSentence(text: string, maxLen: number): number {
  const segment = text.slice(0, maxLen);
  const match = segment.match(/[.!?][^.!?]*$/);
  return match ? segment.lastIndexOf(match[0]) + 1 : -1;
}

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
   * Patch arbitrary text fields on a scene (narrationText, visualPrompt).
   * I7: Nulls stale generated assets when source text changes.
   * I5: Auto-splits narration > 300 chars at a sentence boundary, inserting a 2nd scene.
   * Returns the updated scene plus a list of stale dependency field names.
   */
  async updateSceneFields(
    projectId: string,
    sceneId: string,
    fields: Partial<Pick<StoryboardScene, "narrationText" | "visualPrompt">>,
  ): Promise<{ scene: StoryboardScene; staleDependencies: string[]; splitScene?: StoryboardScene }> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const project = rows[0];
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const storyboard = project.storyboard as VideoStoryboard;
    const sceneIndex = storyboard.timeline.findIndex((s) => s.sceneId === sceneId);
    if (sceneIndex === -1) throw new NotFoundException(`Scene ${sceneId} not found`);

    const existing = storyboard.timeline[sceneIndex];
    const staleDependencies: string[] = [];

    // I7: Null stale assets when source text changes
    const overrides: Partial<StoryboardScene> = {};
    if (fields.narrationText !== undefined && fields.narrationText !== existing.narrationText) {
      overrides.audioUrl = undefined;
      overrides.subtitleTrack = null;
      staleDependencies.push("audioUrl", "subtitleTrack");
    }
    if (fields.visualPrompt !== undefined && fields.visualPrompt !== existing.visualPrompt) {
      overrides.videoUrl = undefined;
      staleDependencies.push("videoUrl");
    }

    let primaryNarration = fields.narrationText ?? existing.narrationText;
    let splitScene: StoryboardScene | undefined;

    // I5: Auto-split narration > 300 chars at a sentence boundary
    if (primaryNarration && primaryNarration.length > 300) {
      const splitAt = splitAtSentence(primaryNarration, 300);
      if (splitAt > 50 && splitAt < primaryNarration.length - 50) {
        const secondPart = primaryNarration.slice(splitAt).trim();
        primaryNarration = primaryNarration.slice(0, splitAt).trim();

        splitScene = {
          sceneId: randomUUID(),
          sequenceNumber: existing.sequenceNumber + 1,
          narrationText: secondPart,
          visualPrompt: existing.visualPrompt,
          isDirty: true,
        };
      }
    }

    const updatedScene: StoryboardScene = {
      ...existing,
      ...fields,
      ...overrides,
      narrationText: primaryNarration,
      isDirty: true,
    };

    // Rebuild timeline: insert split scene after the updated scene if needed
    let timeline = storyboard.timeline.map((s) => (s.sceneId === sceneId ? updatedScene : s));
    if (splitScene) {
      // Re-sequence scenes after the split point
      timeline = [
        ...timeline.slice(0, sceneIndex + 1),
        splitScene,
        ...timeline.slice(sceneIndex + 1).map((s) => ({ ...s, sequenceNumber: s.sequenceNumber + 1 })),
      ];
    }

    const updated = { ...storyboard, timeline };
    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return { scene: updatedScene, staleDependencies, ...(splitScene ? { splitScene } : {}) };
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

  /**
   * I9: Copy a scene (text + prompts) into a different project.
   * Generated assets (audio/video) are NOT copied — they belong to the source project.
   */
  async copySceneTo(sceneId: string, targetProjectId: string): Promise<StoryboardScene> {
    const { scene } = await this.findScene(sceneId);

    const rows = await this.db.select().from(projects).where(eq(projects.id, targetProjectId));
    const target = rows[0];
    if (!target) throw new NotFoundException(`Target project ${targetProjectId} not found`);

    const targetStoryboard = target.storyboard as VideoStoryboard;
    const newScene: StoryboardScene = {
      ...scene,
      sceneId: randomUUID(),
      sequenceNumber: targetStoryboard.timeline.length + 1,
      isDirty: true,
      // Clear generated assets — they reference source-project S3 paths
      audioUrl: undefined,
      videoUrl: undefined,
      subtitleTrack: null,
    };

    const updated: VideoStoryboard = {
      ...targetStoryboard,
      timeline: [...targetStoryboard.timeline, newScene],
    };

    await this.db
      .update(projects)
      .set({ storyboard: updated, updatedAt: new Date() })
      .where(eq(projects.id, targetProjectId));

    return newScene;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async recordAssetHistory(projectId: string, sceneId: string, field: string, previousUrl: string): Promise<void> {
    await this.db
      .insert(sceneAssetHistory)
      .values({ projectId, sceneId, field, previousUrl })
      .catch(() => {}); // non-fatal
  }
}
