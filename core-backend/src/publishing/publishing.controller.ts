import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import pino from "pino";
import { PublisherRegistry } from "./publisher.registry";
import { QueueService } from "../queue/queue.service";
import { VideoAnalyticsService } from "../metrics/video-analytics.service";
import { ChapterMarkersService } from "./chapter-markers.service";
import type { Platform, PublishOptions, PublishResult } from "./video-publisher.interface";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

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
    private readonly chapterMarkers: ChapterMarkersService,
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

  /**
   * F1: Generate YouTube chapter markers for a storyboard.
   * Returns both structured markers and a formatted description block.
   *
   * POST /api/publish/chapter-markers
   * Body: { storyboard: VideoStoryboard }
   */
  @Post("chapter-markers")
  async generateChapterMarkers(
    @Body() body: { storyboard: VideoStoryboard },
  ): Promise<{ markers: { offsetSeconds: number; label: string }[]; description: string }> {
    const markers = await this.chapterMarkers.generate(body.storyboard);
    const description = this.chapterMarkers.formatForDescription(markers);
    return { markers, description };
  }
}
