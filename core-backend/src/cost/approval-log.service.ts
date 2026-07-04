/**
 * Writes per-action approval decisions to the audit log (FEATURE-09).
 */
import { Injectable, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { approvalLog, projects } from "../db/schema";
import { eq } from "drizzle-orm";

const logger = pino({ level: "info" });

export interface LogApprovalParams {
  projectId?: string;
  sceneId?: string;
  action: string;
  provider: string;
  estimatedCost: number;
  actualCost?: number;
  approvedBy: "user" | "auto";
  decision: "approved" | "rejected";
}

@Injectable()
export class ApprovalLogService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async log(params: LogApprovalParams): Promise<void> {
    await (this.db as any).insert(approvalLog).values({
      projectId: params.projectId ?? undefined,
      sceneId: params.sceneId ?? undefined,
      action: params.action,
      provider: params.provider,
      estimatedCost: String(params.estimatedCost),
      actualCost: params.actualCost != null ? String(params.actualCost) : undefined,
      approvedBy: params.approvedBy,
      decision: params.decision,
    });

    logger.info(
      { projectId: params.projectId, action: params.action, decision: params.decision, cost: params.estimatedCost },
      "Approval decision logged",
    );
  }

  /** Increment total_spent_usd for a project after an approved action. */
  async incrementProjectSpend(projectId: string, amount: number): Promise<void> {
    await this.db
      .update(projects)
      .set({ totalSpentUsd: sql`COALESCE(total_spent_usd, 0) + ${amount}` } as any)
      .where(eq(projects.id, projectId));
  }
}
