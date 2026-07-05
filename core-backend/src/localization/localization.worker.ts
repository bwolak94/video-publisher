/**
 * LocalizationWorker (FEATURE-10).
 *
 * BullMQ worker that processes "localization" queue jobs.
 *
 * Job flow:
 *  1. Load original project storyboard.
 *  2. Translate all narrationTexts via LocalizationService (OpenAI GPT-4o).
 *  3. Re-generate audio for all scenes via DubbingService (ElevenLabs/Piper).
 *  4. Save translated+dubbed storyboard to child project, mark status "draft".
 *  5. Emit WS event "localization_complete" to notify the frontend.
 */
import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";
import { QUEUE_CONCURRENCY } from "../queue/queue.config";
import { LocalizationService } from "./localization.service";
import { DubbingService } from "./dubbing.service";
import { EventsGateway } from "../gateway/events.gateway";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });
const QUEUE_NAME = "localization";

export interface LocalizationJobPayload {
  originalProjectId: string;
  childProjectId: string;
  targetLanguage: string;
  targetVoiceId: string;
  regenerateVisuals: boolean;
}

@Injectable()
export class LocalizationWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly localization: LocalizationService,
    private readonly dubbing: DubbingService,
    private readonly gateway: EventsGateway,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      (job: Job) => this.process(job),
      {
        connection: this.redis as any,
        concurrency: QUEUE_CONCURRENCY[QUEUE_NAME] ?? 2,
      },
    );

    this.worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, err }, "Localization job failed");
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async process(job: Job): Promise<void> {
    const payload = job.data as LocalizationJobPayload;
    const { originalProjectId, childProjectId, targetLanguage, targetVoiceId } = payload;

    logger.info({ originalProjectId, childProjectId, targetLanguage }, "Starting localization job");

    try {
      // 1. Load original storyboard
      const original = await this.localization.loadProject(originalProjectId);
      const storyboard = original.storyboard as VideoStoryboard;

      await job.updateProgress(10);

      // 2. Translate narration texts
      const translated = await this.localization.translateStoryboard(storyboard, targetLanguage);

      await job.updateProgress(40);

      // 3. Re-generate audio (dubbing)
      const dubbed = await this.dubbing.regenerateAudio(translated, targetVoiceId);

      await job.updateProgress(90);

      // 4. Persist to child project, mark ready
      await this.localization.finalizeLocalization(childProjectId, dubbed);

      await job.updateProgress(100);

      // 5. Notify frontend
      this.gateway.emitLocalizationEvent(originalProjectId, "localization_complete", {
        childProjectId,
        targetLanguage,
      });

      logger.info({ childProjectId, targetLanguage }, "Localization complete");
    } catch (err: any) {
      await this.localization.markLocalizationFailed(childProjectId, String(err?.message ?? err));
      this.gateway.emitLocalizationEvent(originalProjectId, "localization_failed", {
        childProjectId,
        targetLanguage,
        error: String(err?.message ?? err),
      });
      throw err; // BullMQ will retry per job options
    }
  }
}
