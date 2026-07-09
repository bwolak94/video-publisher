/**
 * F03: Multi-Language Dubbing Export.
 *
 * Orchestrates the full dubbing pipeline for a project:
 *   1. Translate all narration texts via LocalizationService (reuses existing FEATURE-10)
 *   2. Create a child project row (status: "localizing")
 *   3. Queue TTS asset-generation jobs for all scenes in the target language
 *   4. The localization.worker then finalizes (sets status: "draft") and triggers render
 *
 * Endpoint: POST /api/projects/:id/dubbing
 * Body: { targetLanguage: string; targetVoiceId?: string }
 * Response: { childProjectId: string }
 */

import { Injectable } from "@nestjs/common";
import pino from "pino";
import { LocalizationService } from "./localization.service";
import { QueueService } from "../queue/queue.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

@Injectable()
export class DubbingExportService {
  constructor(
    private readonly localization: LocalizationService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Start a full dubbing export for a project.
   * Returns the child project ID immediately; processing is async via the queue.
   */
  async startDubbing(
    projectId: string,
    targetLanguage: string,
    targetVoiceId = DEFAULT_VOICE_ID,
  ): Promise<{ childProjectId: string }> {
    // Load original project
    const project = await this.localization.loadProject(projectId);
    const storyboard = project.storyboard as VideoStoryboard | null;

    if (!storyboard) {
      throw new Error(`Project ${projectId} has no storyboard`);
    }

    // Translate all narration texts
    logger.info({ projectId, targetLanguage }, "Dubbing export: translating storyboard");
    const translated = await this.localization.translateStoryboard(storyboard, targetLanguage);

    // Create child project (status = "localizing")
    const childTitle = `${project.title} [${targetLanguage.toUpperCase()}]`;
    const childProjectId = await this.localization.createLocalizedProject(
      projectId,
      translated,
      targetLanguage,
      childTitle,
    );

    logger.info({ projectId, childProjectId, targetLanguage }, "Dubbing export: child project created");

    // Queue TTS jobs for all translated scenes
    const scenes = translated.timeline;
    for (const scene of scenes) {
      if (!scene.narrationText) continue;
      await this.queue.add("asset-generation", {
        jobId: `dub-${childProjectId}-${scene.sceneId}`,
        projectId: childProjectId,
        sceneId: scene.sceneId,
        step: "audio",
        assetType: "audio",
        narrationText: scene.narrationText,
        voiceId: targetVoiceId,
        standardVoiceId: DEFAULT_VOICE_ID,
      });
    }

    logger.info(
      { childProjectId, sceneCount: scenes.length, targetLanguage },
      "Dubbing export: TTS jobs queued",
    );

    return { childProjectId };
  }
}
