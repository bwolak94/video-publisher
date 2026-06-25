import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { youtubeChannels } from "../db/schema";

const logger = pino({ level: "info" });

const WARNING_THRESHOLD = 0.8; // 80%

export interface BudgetCheckResult {
  blocked: boolean;
  warning: boolean;
  percentUsed: number;
  message?: string;
}

@Injectable()
export class BudgetService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async checkBudget(channelId: string, estimatedCost: number): Promise<BudgetCheckResult> {
    const row = await this.getChannelRow(channelId);
    if (!row) {
      return { blocked: false, warning: false, percentUsed: 0 };
    }

    const budget = parseFloat(row.monthlyBudgetUsd ?? "0");
    const spend = parseFloat(row.currentMonthSpendUsd ?? "0");

    // Budget = 0 means unlimited
    if (budget === 0) {
      return { blocked: false, warning: false, percentUsed: 0 };
    }

    const projectedSpend = spend + estimatedCost;
    const percentUsed = projectedSpend / budget;

    if (projectedSpend > budget) {
      const nextMonth = this.nextMonthDate();
      logger.warn(
        { channelId, spend, estimatedCost, budget },
        "Monthly budget hard stop triggered"
      );
      return {
        blocked: true,
        warning: false,
        percentUsed,
        message: `Monthly budget exceeded. Upgrade your plan or wait until ${nextMonth}.`,
      };
    }

    if (percentUsed >= WARNING_THRESHOLD) {
      const pct = Math.round(percentUsed * 100);
      logger.warn({ channelId, pct, budget }, "Monthly budget 80% warning");
      await this.sendWarningNotification(channelId, pct, budget);
      return {
        blocked: false,
        warning: true,
        percentUsed,
        message: `Warning: Channel has used ${pct}% of its $${budget.toFixed(2)} monthly budget.`,
      };
    }

    return { blocked: false, warning: false, percentUsed };
  }

  async incrementSpend(channelId: string, amount: number): Promise<void> {
    await this.db
      .update(youtubeChannels)
      .set({
        currentMonthSpendUsd: sql`CAST(current_month_spend_usd AS NUMERIC) + ${amount}`,
      })
      .where(eq(youtubeChannels.channelId, channelId));

    logger.info({ channelId, amount }, "Monthly spend incremented");
  }

  protected async getChannelRow(channelId: string): Promise<any> {
    const rows = await this.db
      .select()
      .from(youtubeChannels)
      .where(eq(youtubeChannels.channelId, channelId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async sendWarningNotification(
    channelId: string,
    pct: number,
    budget: number
  ): Promise<void> {
    const webhook = process.env.WORKER_NOTIFICATION_WEBHOOK;
    if (!webhook) return;
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "budget_warning", channelId, pct, budget }),
    }).catch((err) => logger.error({ err }, "Budget warning webhook failed"));
  }

  private nextMonthDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().split("T")[0];
  }
}
