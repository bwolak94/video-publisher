import { Injectable, Inject, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { costRecords } from "../db/schema";
import { ProjectBudgetService } from "./project-budget.service";
import { CostAnomalyService } from "./cost-anomaly.service";

const logger = pino({ level: "info" });

export interface RecordCostOptions {
  projectId: string;
  sceneId?: string;
  assetType: "audio" | "video" | "image";
  provider: string;
  estimatedCostUsd: number;
  actualCostUsd?: number;
}

export interface CostBreakdownResult {
  projectId: string;
  records: Array<{
    sceneId: string | null;
    assetType: string;
    provider: string;
    estimatedCostUsd: number;
    actualCostUsd: number | null;
  }>;
  totals: {
    estimatedUsd: number;
    actualUsd: number | null;
  };
}

@Injectable()
export class CostRecordService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Optional() private readonly projectBudget?: ProjectBudgetService,
    @Optional() private readonly anomaly?: CostAnomalyService,
  ) {}

  async record(opts: RecordCostOptions): Promise<void> {
    await this.db.insert(costRecords).values({
      projectId: opts.projectId,
      sceneId: opts.sceneId ?? null,
      assetType: opts.assetType,
      provider: opts.provider,
      estimatedCostUsd: opts.estimatedCostUsd.toFixed(6),
      actualCostUsd: opts.actualCostUsd != null ? opts.actualCostUsd.toFixed(6) : null,
    } as any);

    logger.info(
      { projectId: opts.projectId, sceneId: opts.sceneId, provider: opts.provider, estimatedCostUsd: opts.estimatedCostUsd },
      "Cost record saved"
    );

    // I05: increment project spend and check budget thresholds
    if (this.projectBudget) {
      await this.projectBudget.incrementSpend(opts.projectId, opts.estimatedCostUsd).catch(() => {});
      await this.projectBudget.checkAfterRecord(opts.projectId).catch(() => {});
    }

    // I6: cost anomaly detection (non-fatal)
    if (this.anomaly && opts.actualCostUsd != null) {
      await this.anomaly.check({
        projectId: opts.projectId,
        sceneId: opts.sceneId,
        provider: opts.provider,
        assetType: opts.assetType,
        costUsd: opts.actualCostUsd,
      }).catch(() => {});
    }
  }

  async getBreakdown(projectId: string): Promise<CostBreakdownResult> {
    const rows = await this.db
      .select()
      .from(costRecords)
      .where(eq(costRecords.projectId, projectId));

    const estimatedTotal = rows.reduce((acc, r) => acc + parseFloat(r.estimatedCostUsd as string), 0);
    const hasActual = rows.some((r) => r.actualCostUsd != null);
    const actualTotal = hasActual
      ? rows.reduce((acc, r) => acc + (r.actualCostUsd != null ? parseFloat(r.actualCostUsd as string) : 0), 0)
      : null;

    return {
      projectId,
      records: rows.map((r) => ({
        sceneId: r.sceneId,
        assetType: r.assetType,
        provider: r.provider,
        estimatedCostUsd: parseFloat(r.estimatedCostUsd as string),
        actualCostUsd: r.actualCostUsd != null ? parseFloat(r.actualCostUsd as string) : null,
      })),
      totals: {
        estimatedUsd: estimatedTotal,
        actualUsd: actualTotal,
      },
    };
  }
}
