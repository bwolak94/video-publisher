import { Injectable, Inject } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { sql } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { youtubeChannels } from "../db/schema";

const logger = pino({ level: "info" });

// Fires at 00:00 on the 1st of every month
const MONTHLY_RESET_CRON = process.env.BUDGET_RESET_CRON ?? "0 0 1 * *";

@Injectable()
export class BudgetResetService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onModuleInit() {
    const job = new CronJob(MONTHLY_RESET_CRON, async () => {
      await this.resetAllSpend();
    });
    this.schedulerRegistry.addCronJob("budget-monthly-reset", job);
    job.start();
    logger.info({ cron: MONTHLY_RESET_CRON }, "Monthly budget reset cron registered");
  }

  async resetAllSpend(): Promise<void> {
    await this.db
      .update(youtubeChannels)
      .set({ currentMonthSpendUsd: sql`0` });
    logger.info("Monthly budget reset: all channel spend set to 0");
  }
}
