/**
 * LocalizationController (FEATURE-10).
 *
 * POST /api/projects/:projectId/localize
 *   → Creates a child (localized) project and enqueues a BullMQ job.
 *   ← Returns { jobId, childProjectId }
 *
 * GET /api/projects/:projectId/localizations
 *   ← Returns all child localized projects for a given original project.
 */
import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import pino from "pino";
import { LocalizationService } from "./localization.service";
import { QueueService } from "../queue/queue.service";
import { LocalizeProjectDto } from "./dto/localize-project.dto";
import type { VideoStoryboard } from "../storyboard/video-storyboard";
import type { LocalizationJobPayload } from "./localization.worker";

const logger = pino({ level: "info" });

@Controller("api/projects/:projectId")
export class LocalizationController {
  constructor(
    private readonly localization: LocalizationService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Kick off a localization pipeline for an existing project.
   * Immediately creates the child project row (so the frontend has an ID to
   * navigate to), then enqueues the translate + dub work in BullMQ.
   */
  @Post("localize")
  @HttpCode(HttpStatus.ACCEPTED)
  async localize(
    @Param("projectId") projectId: string,
    @Body() dto: LocalizeProjectDto,
  ): Promise<{ jobId: string; childProjectId: string }> {
    const { targetLanguage, targetVoiceId, regenerateVisuals = false } = dto;

    // Load original project to get title + storyboard
    const original = await this.localization.loadProject(projectId);
    const storyboard = original.storyboard as VideoStoryboard | null;

    const childTitle = `${original.title} [${targetLanguage.toUpperCase()}]`;

    // Create child project with a placeholder (empty) storyboard and "localizing" status
    const childProjectId = await this.localization.createLocalizedProject(
      projectId,
      storyboard ?? { meta: { title: childTitle, aspectRatio: "16:9", language: targetLanguage as any, voiceId: targetVoiceId }, timeline: [] },
      targetLanguage,
      childTitle,
    );

    // Enqueue the actual translation + dubbing work
    const payload: LocalizationJobPayload = {
      originalProjectId: projectId,
      childProjectId,
      targetLanguage,
      targetVoiceId,
      regenerateVisuals,
    };

    const job = await this.queue.add("localization", payload as unknown as Record<string, unknown>);

    logger.info({ projectId, childProjectId, targetLanguage, jobId: job.id }, "Localization job enqueued");

    return { jobId: job.id as string, childProjectId };
  }

  /**
   * Return all localized child projects derived from this original project.
   */
  @Get("localizations")
  async getLocalizations(
    @Param("projectId") projectId: string,
  ): Promise<any[]> {
    return this.localization.findLocalizations(projectId);
  }
}
