import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { JobSyncService } from "../job-sync.service";
import { DlqAlertService } from "../dlq-alert.service";
import { DlqService } from "../dlq.service";
import { MetricsService } from "../../metrics/metrics.service";
import { PublisherRegistry } from "../../publishing/publisher.registry";
import type { Platform, PublishOptions, PublishResult } from "../../publishing/video-publisher.interface";
import { QUEUE_CONCURRENCY, RESEARCH_WORKER_SETTINGS } from "../queue.config";

const logger = pino({ level: "info" });
const QUEUE_NAME = "publish";
const MAX_ATTEMPTS = 3;

export interface PublishJobPayload {
  jobId: string;
  projectId: string;
  platforms: Platform[];
  options: PublishOptions;
}

/**
 * BullMQ worker for scheduled / delayed video publishing.
 * Jobs are enqueued with `delay` when the user sets a `publishAt` timestamp.
 * On execution, publishes to all requested platforms in parallel.
 */
@Injectable()
export class PublishWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly jobSync: JobSyncService,
    private readonly dlqAlert: DlqAlertService,
    private readonly dlq: DlqService,
    private readonly metrics: MetricsService,
    private readonly registry: PublisherRegistry,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<PublishJobPayload>) => this.process(job),
      {
        connection: this.redis,
        concurrency: QUEUE_CONCURRENCY[QUEUE_NAME] ?? 3,
        stalledInterval: RESEARCH_WORKER_SETTINGS.stalledInterval,
        maxStalledCount: RESEARCH_WORKER_SETTINGS.maxStalledCount,
      },
    );

    this.worker.on("active", (job) => this.onActive(job));
    this.worker.on("completed", (job) => this.onCompleted(job));
    this.worker.on("failed", (job, err) => this.onFailed(job, err));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<PublishJobPayload>): Promise<PublishResult[]> {
    const { platforms, options, projectId } = job.data;
    logger.info({ jobId: job.id, projectId, platforms }, "Executing scheduled publish job");

    const results = await Promise.allSettled(
      platforms.map((platform) => this.registry.get(platform).upload(options)),
    );

    const output = results.map((r, i) => {
      if (r.status === "fulfilled") {
        logger.info({ projectId, platform: platforms[i], url: r.value.url }, "Platform publish succeeded");
        return r.value;
      }
      logger.error({ projectId, platform: platforms[i], err: r.reason?.message }, "Platform publish failed");
      return { platform: platforms[i], platformVideoId: "", error: (r.reason as Error).message } as any;
    });

    return output;
  }

  private async onActive(job: Job<PublishJobPayload>) {
    await this.jobSync.syncActive(job.data.jobId);
  }

  private async onCompleted(job: Job<PublishJobPayload>) {
    await this.jobSync.syncCompleted(job.data.jobId);
  }

  private async onFailed(job: Job<PublishJobPayload> | undefined, err: Error) {
    if (!job) return;
    await this.jobSync.syncFailed(job.data.jobId, err);

    if ((job.attemptsMade ?? 0) >= MAX_ATTEMPTS) {
      await this.dlqAlert.alert(job.data.jobId, QUEUE_NAME, err);
      await this.dlq.enqueue(QUEUE_NAME, job.data as any, err, job.attemptsMade ?? 0);
      this.metrics.dlqDepth.inc({ queue: QUEUE_NAME });
    }
  }
}
