import { Injectable, Inject } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { webhooks } from "../db/schema";

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
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async create(userId: string, url: string, events: WebhookEvent[]): Promise<schema.Webhook> {
    const secret = randomBytes(32).toString("hex");
    const [row] = await this.db
      .insert(webhooks)
      .values({ userId, url, secret, events, active: true })
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
      .set({ active: false })
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)));
    logger.info({ id, userId }, "Webhook deactivated");
  }

  async fanOut(event: WebhookEvent, payload: Omit<WebhookPayload, "event" | "timestamp">): Promise<void> {
    const active = await this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.active, true));

    const matching = active.filter((w) => (w.events as string[]).includes(event));
    if (matching.length === 0) return;

    const body: WebhookPayload = { event, timestamp: new Date().toISOString(), ...payload };
    const bodyStr = JSON.stringify(body);

    await Promise.allSettled(
      matching.map((w) => this.deliver(w.url, w.secret, bodyStr, event))
    );
  }

  private async deliver(url: string, secret: string, body: string, event: WebhookEvent): Promise<void> {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
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
      if (!res.ok) {
        logger.warn({ url, status: res.status, event }, "Webhook delivery non-2xx");
      } else {
        logger.info({ url, event }, "Webhook delivered");
      }
    } catch (err) {
      logger.error({ url, event, err }, "Webhook delivery failed");
    }
  }
}
