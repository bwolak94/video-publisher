import { Injectable } from "@nestjs/common";
import pino from "pino";

const logger = pino({ level: "warn" });

/**
 * Handles Dead Letter Queue escalation after all retry attempts are exhausted.
 * Logs a CRITICAL alert and fires a webhook (URL from env).
 */
@Injectable()
export class DlqAlertService {
  async alert(jobId: string, queueName: string, error: Error): Promise<void> {
    logger.error(
      { jobId, queueName, error: error.message, level: "CRITICAL" },
      "DLQ escalation: job exhausted all retries"
    );

    const webhookUrl = process.env.DLQ_WEBHOOK_URL;
    if (webhookUrl) {
      await this.fireWebhook(webhookUrl, { jobId, queueName, error: error.message });
    }
  }

  private async fireWebhook(
    url: string,
    body: Record<string, unknown>
  ): Promise<void> {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      logger.error({ url, err }, "DLQ webhook delivery failed");
    }
  }
}
