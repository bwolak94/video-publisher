/**
 * I4: Prometheus queue depth metrics — polls BullMQ every 30s and updates
 * gauges for waiting, active, delayed, and failed job counts per queue.
 */
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import pino from "pino";
import { MetricsService } from "./metrics.service";
import { QueueService } from "../queue/queue.service";

const logger = pino({ level: "info" });

@Injectable()
export class QueueDepthPollerService implements OnModuleInit {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queues: QueueService,
  ) {}

  onModuleInit() {
    // Kick off an initial poll so Grafana isn't blank on startup
    this.poll().catch(() => {});
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async poll(): Promise<void> {
    const allQueues = this.queues.getAllQueues();

    await Promise.all(
      allQueues.map(async (queue) => {
        try {
          const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");

          this.metrics.queueJobsByStatus.labels({ queue: queue.name, status: "waiting" }).set(counts.waiting ?? 0);
          this.metrics.queueJobsByStatus.labels({ queue: queue.name, status: "active" }).set(counts.active ?? 0);
          this.metrics.queueJobsByStatus.labels({ queue: queue.name, status: "delayed" }).set(counts.delayed ?? 0);
          this.metrics.queueJobsByStatus.labels({ queue: queue.name, status: "failed" }).set(counts.failed ?? 0);
        } catch (err) {
          logger.warn({ queue: queue.name, err }, "I4: Failed to poll queue depth");
        }
      }),
    );
  }
}
