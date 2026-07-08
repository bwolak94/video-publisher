import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import { createHmac } from "crypto";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { QUEUE_CONCURRENCY, RESEARCH_WORKER_SETTINGS } from "../queue.config";

const logger = pino({ level: "info" });
const QUEUE_NAME = "webhook";

export interface WebhookDeliveryPayload {
  url: string;
  secret: string;
  body: string;
  event: string;
}

/**
 * BullMQ worker that delivers webhook payloads with automatic retry.
 * Retries 3× with exponential backoff (5s → 25s → 125s) on non-2xx or network errors.
 */
@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<WebhookDeliveryPayload>) => this.deliver(job),
      {
        connection: this.redis,
        concurrency: QUEUE_CONCURRENCY[QUEUE_NAME] ?? 5,
        stalledInterval: RESEARCH_WORKER_SETTINGS.stalledInterval,
        maxStalledCount: RESEARCH_WORKER_SETTINGS.maxStalledCount,
      },
    );

    this.worker.on("failed", (job, err) => {
      logger.warn({ url: job?.data.url, event: job?.data.event, attempt: job?.attemptsMade, err: err.message }, "Webhook delivery failed");
    });
    this.worker.on("completed", (job) => {
      logger.info({ url: job.data.url, event: job.data.event }, "Webhook delivered");
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async deliver(job: Job<WebhookDeliveryPayload>): Promise<void> {
    const { url, secret, body, event } = job.data;
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-256": `sha256=${signature}`,
        "X-Event": event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Throw so BullMQ retries according to the backoff policy
      throw new Error(`Webhook endpoint returned HTTP ${res.status}`);
    }
  }
}
