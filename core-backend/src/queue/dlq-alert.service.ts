import { Injectable } from "@nestjs/common";
import { AlertService } from "../alerts/alert.service";
import pino from "pino";

const logger = pino({ level: "warn" });

/**
 * Handles Dead Letter Queue escalation after all retry attempts are exhausted.
 * Delegates to AlertService for Slack + email delivery with deduplication.
 */
@Injectable()
export class DlqAlertService {
  constructor(private readonly alertService: AlertService) {}

  async alert(jobId: string, queueName: string, error: Error): Promise<void> {
    logger.error(
      { jobId, queueName, error: error.message, level: "CRITICAL" },
      "DLQ escalation: job exhausted all retries"
    );

    await this.alertService.send("dlq_escalation", {
      jobId,
      queueName,
      errorMessage: error.message,
    });
  }
}
