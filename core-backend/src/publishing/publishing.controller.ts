import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import pino from "pino";
import { PublisherRegistry } from "./publisher.registry";
import { QueueService } from "../queue/queue.service";
import { VideoAnalyticsService } from "../metrics/video-analytics.service";
import type { Platform, PublishOptions, PublishResult } from "./video-publisher.interface";

const logger = pino({ level: "info" });

interface PublishBody extends PublishOptions {
  platforms: Platform[];
  /** ISO-8601 timestamp — if set, publish is deferred to this time via BullMQ delayed job */
  publishAt?: string;
}

@Controller("api/publish")
export class PublishingController {
  constructor(
    private readonly registry: PublisherRegistry,
    private readonly queue: QueueService,
    private readonly analytics: VideoAnalyticsService,
  ) {}

  /**
   * Publish a video to one or more platforms.
   *
   * - If `publishAt` is set → enqueues a delayed BullMQ job (scheduled publishing).
   * - Otherwise → publishes immediately in parallel, returning per-platform results.
   *
   * Individual platform failures don't block other platforms.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async publish(@Body() body: PublishBody): Promise<PublishResult[] | { scheduled: true; jobId: string; publishAt: string }> {
    const { platforms, publishAt, ...options } = body;

    if (publishAt) {
      const publishAtMs = new Date(publishAt).getTime();
      const now = Date.now();
      if (Number.isNaN(publishAtMs)) {
        throw new Error(`Invalid publishAt timestamp: ${publishAt}`);
      }
      const delay = Math.max(0, publishAtMs - now);

      const job = await this.queue.add(
        "publish",
        { platforms, options, projectId: options.projectId, jobId: `pub-${Date.now()}` },
        { delay },
      );

      logger.info(
        { jobId: job.id, platforms, publishAt, delayMs: delay },
        "Scheduled publish job enqueued",
      );

      return { scheduled: true, jobId: job.id ?? "", publishAt };
    }

    // Immediate publish
    const results = await Promise.allSettled(
      platforms.map((platform) => this.registry.get(platform).upload(options)),
    );

    const output = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        platform: platforms[i],
        platformVideoId: "",
        error: (r.reason as Error).message,
      } as any;
    });

    // Seed zero-row analytics for each successful publish so the hourly cron has entries to update
    if (options.projectId) {
      for (const result of output) {
        if (!result.error && result.platformVideoId) {
          this.analytics.record(options.projectId, result.platform, result.platformVideoId).catch(() => {});
        }
      }
    }

    return output;
  }
}
