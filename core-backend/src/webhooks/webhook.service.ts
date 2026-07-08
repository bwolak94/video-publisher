import { Injectable, Inject } from "@nestjs/common";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { webhooks } from "../db/schema";
import { QueueService } from "../queue/queue.service";
import type { WebhookDeliveryPayload } from "../queue/workers/webhook-delivery.worker";

const logger = pino({ level: "info" });

export type WebhookEvent =
  | "job.completed"
  | "job.failed"
  | "video.published"
  | "budget.warning"
  | "dlq.alert";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  [key: string]: unknown;
}

@Injectable()
export class WebhookService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly queue: QueueService,
  ) {}

  async create(userId: string, url: string, events: WebhookEvent[]): Promise<schema.Webhook> {
    const secret = randomBytes(32).toString("hex");
    const [row] = await this.db
      .insert(webhooks)
      .values({ userId, url, secret, events, active: true } as any)
      .returning();
    logger.info({ userId, url }, "Webhook created");
    return row;
  }

  async list(userId: string): Promise<schema.Webhook[]> {
    return this.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.userId, userId), eq(webhooks.active, true)));
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.db
      .update(webhooks)
      .set({ active: false } as any)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)));
    logger.info({ id, userId }, "Webhook deactivated");
  }

  /**
   * Enqueue a delivery job for every active webhook subscribed to `event`.
   * BullMQ will retry up to 3× with exponential backoff on failures.
   */
  async fanOut(event: WebhookEvent, payload: Omit<WebhookPayload, "event" | "timestamp">): Promise<void> {
    const active = await this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.active, true));

    const matching = active.filter((w) => (w.events as string[]).includes(event));
    if (matching.length === 0) return;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload });

    await Promise.all(
      matching.map((w) => {
        const deliveryPayload: WebhookDeliveryPayload = {
          url: w.url,
          secret: w.secret,
          body,
          event,
        };
        return this.queue
          .add("webhook", deliveryPayload as unknown as Record<string, unknown>)
          .catch((err) => logger.error({ url: w.url, event, err }, "Failed to enqueue webhook delivery"));
      }),
    );

    logger.info({ event, count: matching.length }, "Webhook deliveries enqueued");
  }
}
