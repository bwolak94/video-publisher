import { Injectable, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import pino from "pino";
import { WorkerModeService } from "./worker-mode.service";

const logger = pino({ level: "info" });

// Default channel used when no channel configuration exists yet.
// In production this will be replaced by per-channel scheduling.
const DEFAULT_CHANNEL_ID = process.env.WORKER_DEFAULT_CHANNEL_ID ?? "default";

@Injectable()
export class CronWorkerService implements OnModuleInit {
  constructor(
    private readonly workerMode: WorkerModeService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onModuleInit() {
    const cronSchedule = process.env.WORKER_CRON_SCHEDULE ?? "0 * * * *";

    const job = new CronJob(cronSchedule, async () => {
      logger.info({ cronSchedule }, "Worker mode cron fired");
      try {
        await this.workerMode.triggerCycle({ channelId: DEFAULT_CHANNEL_ID });
      } catch (err) {
        logger.error({ err }, "Worker mode cron cycle failed");
      }
    });

    this.schedulerRegistry.addCronJob("worker-mode-cycle", job);
    job.start();
    logger.info({ cronSchedule }, "Worker mode cron registered");
  }
}
