import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { DRIZZLE } from "../../db/db.module";
import { webhooks, webhookDeliveryLog } from "../../db/schema";
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

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    @Inject(DRIZZLE) private readonly db: any,
  ) {}

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

    // I8: look up the webhookId by URL+event to associate log entries
    const webhookRows = await this.db
      .select({ id: webhooks.id })
      .from(webhooks)
      .where(eq(webhooks.url, url))
      .limit(1)
      .catch(() => []);
    const webhookId: string | null = webhookRows[0]?.id ?? null;

    let statusCode: string | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
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

      statusCode = String(res.status);
      responseBody = (await res.text().catch(() => "")).slice(0, 500);
      success = res.ok;

      if (!success) {
        throw new Error(`Webhook endpoint returned HTTP ${res.status}`);
      }
    } finally {
      // I8: log every attempt (success or failure) non-fatally
      if (webhookId) {
        await this.db
          .insert(webhookDeliveryLog)
          .values({ webhookId, event, statusCode, responseBody, success })
          .catch(() => {});
      }
    }
  }
}
