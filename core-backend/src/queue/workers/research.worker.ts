import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { DlqAlertService } from "../dlq-alert.service";
import { DlqService } from "../dlq.service";
import { QueueService } from "../queue.service";
import { DeduplicationService } from "../../worker-mode/deduplication.service";
import { MetricsService } from "../../metrics/metrics.service";
import { QUEUE_CONCURRENCY, RESEARCH_WORKER_SETTINGS } from "../queue.config";

const logger = pino({ level: "info" });
const QUEUE_NAME = "research";
const MAX_ATTEMPTS = 3;

export interface ResearchJobPayload {
  jobId: string;
  channelId: string;
  nicheProfileId: string;
  sources: string[];
  deduplicationWindowHours: number;
  minViralityScore: number;
}

export interface ResearchResult {
  topic: string;
  viralityScore: number;
  summary: string;
  sourceUrls: string[];
}

@Injectable()
export class ResearchWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly dlqAlert: DlqAlertService,
    private readonly dlq: DlqService,
    private readonly queue: QueueService,
    private readonly dedup: DeduplicationService,
    private readonly metrics: MetricsService
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<ResearchJobPayload>) => this.process(job),
      {
        connection: this.redis,
        concurrency: QUEUE_CONCURRENCY[QUEUE_NAME],
        stalledInterval: RESEARCH_WORKER_SETTINGS.stalledInterval,
        maxStalledCount: RESEARCH_WORKER_SETTINGS.maxStalledCount,
      }
    );

    this.worker.on("failed", (job, err) => this.onFailed(job, err));
  }

  async onModuleDestroy() {
    if (!this.worker) return;
    const graceful = this.worker.close(false);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    await Promise.race([graceful, timeout]);
  }

  // ── Job processor ──────────────────────────────────────────────────────────

  private async process(job: Job<ResearchJobPayload>): Promise<void> {
    const { channelId, nicheProfileId, sources, deduplicationWindowHours, minViralityScore } =
      job.data;

    logger.info({ jobId: job.id, channelId, nicheProfileId }, "Processing research job");

    const result = await this.callAiBackend({ channelId, nicheProfileId, sources });

    if (result.viralityScore < minViralityScore) {
      logger.info(
        { topic: result.topic, score: result.viralityScore, threshold: minViralityScore },
        "Worker cycle skipped — virality below threshold"
      );
      return;
    }

    const isDuplicate = await this.dedup.isDuplicate(result.topic);
    if (isDuplicate) {
      logger.info({ topic: result.topic }, "Worker cycle skipped — topic already seen within dedup window");
      return;
    }

    await this.dedup.markSeen(result.topic, deduplicationWindowHours);

    await this.queue.add("asset-generation", {
      channelId,
      nicheProfileId,
      topic: result.topic,
      summary: result.summary,
      sourceUrls: result.sourceUrls,
    });

    logger.info({ topic: result.topic, channelId }, "Research complete — asset-generation enqueued");

    await this.sendNotification("success", { channelId, topic: result.topic });
  }

  // ── AI backend call (injectable for testing) ───────────────────────────────

  protected async callAiBackend(params: {
    channelId: string;
    nicheProfileId: string;
    sources: string[];
  }): Promise<ResearchResult> {
    const aiBackendUrl = process.env.AI_BACKEND_URL ?? "http://localhost:8000";
    const res = await fetch(`${aiBackendUrl}/api/worker/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`AI backend research failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<ResearchResult>;
  }

  // ── Lifecycle event handlers ───────────────────────────────────────────────

  private async onFailed(job: Job<ResearchJobPayload> | undefined, err: Error) {
    if (!job) return;
    logger.error({ jobId: job.id, err: err.message }, "Research job failed");

    if ((job.attemptsMade ?? 0) >= MAX_ATTEMPTS) {
      await this.dlqAlert.alert(job.data?.jobId ?? String(job.id), QUEUE_NAME, err);
      await this.dlq.enqueue(QUEUE_NAME, job.data as any, err, job.attemptsMade ?? 0);
      this.metrics.dlqDepth.inc({ queue: QUEUE_NAME });
      await this.sendNotification("failure", { channelId: job.data?.channelId, error: err.message });
    }
  }

  private async sendNotification(
    type: "success" | "failure",
    payload: Record<string, unknown>
  ): Promise<void> {
    const webhookUrl = process.env.WORKER_NOTIFICATION_WEBHOOK;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
    } catch (err) {
      logger.error({ webhookUrl, err }, "Worker notification webhook failed");
    }
  }
}
