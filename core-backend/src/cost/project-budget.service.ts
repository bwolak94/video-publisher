/**
 * I05: Per-project cost budget alerts.
 *
 * Checks the project's `projectBudgetUsd` after each cost record is inserted.
 * - At ≥80%: emits `budget_warning` webhook and logs warning.
 * - At 100%: emits `budget_exceeded` webhook; marks project status as `budget_paused`.
 *
 * Resume is triggered via POST /api/projects/:id/resume-budget.
 */

import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { projects } from "../db/schema";

const logger = pino({ level: "info" });

const WARNING_THRESHOLD = 0.8;

export type BudgetStatus = "ok" | "warning" | "exceeded";

@Injectable()
export class ProjectBudgetService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Called after a cost record is saved.
   * Returns "ok", "warning", or "exceeded" and side-effects the project row accordingly.
   */
  async checkAfterRecord(projectId: string): Promise<BudgetStatus> {
    const row = await this.db
      .select({
        totalSpentUsd:    projects.totalSpentUsd,
        projectBudgetUsd: projects.projectBudgetUsd,
        status:           projects.status,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!row) return "ok";

    const budget = parseFloat(row.projectBudgetUsd ?? "0");
    if (budget === 0) return "ok"; // 0 = unlimited

    const spent = parseFloat(row.totalSpentUsd ?? "0");
    const ratio = spent / budget;

    if (ratio >= 1.0 && row.status !== "budget_paused") {
      logger.warn({ projectId, spent, budget }, "Project budget exceeded — pausing");
      await this.db
        .update(projects)
        .set({ status: "budget_paused", updatedAt: new Date() } as any)
        .where(eq(projects.id, projectId));

      this.notifyWebhook("budget_exceeded", {
        projectId,
        spentUsd: spent,
        budgetUsd: budget,
        percentUsed: Math.round(ratio * 100),
      });

      return "exceeded";
    }

    if (ratio >= WARNING_THRESHOLD) {
      logger.warn({ projectId, spent, budget, pct: Math.round(ratio * 100) }, "Project budget 80% warning");
      this.notifyWebhook("budget_warning", {
        projectId,
        spentUsd: spent,
        budgetUsd: budget,
        percentUsed: Math.round(ratio * 100),
      });

      return "warning";
    }

    return "ok";
  }

  /** Unblock a paused project so queue jobs can resume. */
  async resumeProject(projectId: string): Promise<void> {
    await this.db
      .update(projects)
      .set({ status: "draft", updatedAt: new Date() } as any)
      .where(eq(projects.id, projectId));
    logger.info({ projectId }, "Project budget pause lifted");
  }

  /** Update the project budget. */
  async setBudget(projectId: string, budgetUsd: number): Promise<void> {
    await this.db
      .update(projects)
      .set({ projectBudgetUsd: budgetUsd.toFixed(2), updatedAt: new Date() } as any)
      .where(eq(projects.id, projectId));
    logger.info({ projectId, budgetUsd }, "Project budget updated");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Fire a best-effort notification to WORKER_NOTIFICATION_WEBHOOK if configured. */
  private notifyWebhook(event: string, payload: Record<string, unknown>): void {
    const url = process.env.WORKER_NOTIFICATION_WEBHOOK;
    if (!url) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
    }).catch((err) => logger.error({ err, event }, "Budget webhook notification failed"));
  }

  /** Atomically increment project totalSpentUsd. */
  async incrementSpend(projectId: string, amount: number): Promise<void> {
    await this.db
      .update(projects)
      .set({
        totalSpentUsd: sql`CAST(total_spent_usd AS NUMERIC) + ${amount}`,
        updatedAt: new Date(),
      } as any)
      .where(eq(projects.id, projectId));
  }
}
