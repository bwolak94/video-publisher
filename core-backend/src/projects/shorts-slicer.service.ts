/**
 * F2: Shorts Slicer — picks the top 3 scenes from a long-form storyboard
 * (scored by narration length + visual energy heuristic) and creates a new
 * 9:16 "shorts" project from them.
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import pino from "pino";
import { ProjectsService } from "./projects.service";
import type { VideoStoryboard, StoryboardScene } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

const SHORT_SCENE_COUNT = 3;
const MAX_SHORT_DURATION_S = 60;

@Injectable()
export class ShortsSlicerService {
  constructor(private readonly projects: ProjectsService) {}

  /**
   * Slice `projectId` into a vertical short.
   * Returns the newly created short project.
   */
  async slice(projectId: string, userId?: string | null): Promise<{ projectId: string; title: string; scenes: number }> {
    const project = await this.projects.findOne(projectId);
    const storyboard = project.storyboard as VideoStoryboard | null;

    if (!storyboard?.timeline?.length) {
      throw new NotFoundException(`Project ${projectId} has no scenes to slice`);
    }

    const scored = this.scoreScenes(storyboard.timeline);
    const picked = this.pickScenes(scored);

    const shortStoryboard: VideoStoryboard = {
      meta: {
        ...storyboard.meta,
        aspectRatio: "9:16",
        title: `${storyboard.meta.title} – Short`,
        musicFadeInSeconds: 0,
        musicFadeOutSeconds: 2,
      },
      timeline: picked.map((s, i) => ({ ...s, sequenceNumber: i + 1 })),
    };

    const newProject = await this.projects.createWithStoryboard(
      `${project.title} – Short`,
      shortStoryboard as unknown as Record<string, unknown>,
      userId ?? project.userId,
    );

    logger.info(
      { sourceProjectId: projectId, shortProjectId: newProject.id, scenes: picked.length },
      "F2: Short created from slice",
    );

    return { projectId: newProject.id, title: newProject.title, scenes: picked.length };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Heuristic score: reward short narrations (punchy) + scenes that already
   * have a video asset (proven visual) + scenes near the start (hook matters).
   */
  private scoreScenes(scenes: StoryboardScene[]): Array<{ scene: StoryboardScene; score: number }> {
    return scenes.map((s, i) => {
      const wordCount = s.narrationText.split(/\s+/).length;
      const punchiness = wordCount <= 20 ? 3 : wordCount <= 40 ? 1 : 0;
      const hasAsset = s.videoUrl ? 2 : 0;
      const position = i === 0 ? 2 : 0; // favour hook scene
      return { scene: s, score: punchiness + hasAsset + position };
    });
  }

  private pickScenes(
    scored: Array<{ scene: StoryboardScene; score: number }>,
  ): StoryboardScene[] {
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const picked: StoryboardScene[] = [];
    let totalDuration = 0;

    for (const { scene } of sorted) {
      const dur = scene.durationInSeconds ?? 5;
      if (picked.length >= SHORT_SCENE_COUNT) break;
      if (totalDuration + dur > MAX_SHORT_DURATION_S) continue;
      picked.push(scene);
      totalDuration += dur;
    }

    // Re-sort by original sequence order for coherent narrative
    return picked.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }
}
