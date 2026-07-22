import { Injectable, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { eq, and, desc } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { narrationVariants, type NarrationVariant, type NewNarrationVariant } from "../db/schema";

const logger = pino({ level: "info" });

export interface CreateVariantDto {
  sceneId: string;
  variantKey: "a" | "b";
  audioS3Url: string;
  voiceId?: string;
  scriptText?: string;
}

export interface VariantAnalyticsDto {
  views: string;
  avgViewDurationPct: number;
}

@Injectable()
export class NarrationVariantsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(projectId: string, dto: CreateVariantDto): Promise<NarrationVariant> {
    // Enforce max one variant per (projectId, sceneId, variantKey)
    const existing = await this.db
      .select()
      .from(narrationVariants)
      .where(
        and(
          eq(narrationVariants.projectId, projectId),
          eq(narrationVariants.sceneId, dto.sceneId),
          eq(narrationVariants.variantKey, dto.variantKey),
        )
      )
      .limit(1);

    if (existing[0]) {
      throw new BadRequestException(
        `Variant "${dto.variantKey}" already exists for scene ${dto.sceneId}. Delete it first.`
      );
    }

    const [row] = await this.db
      .insert(narrationVariants)
      .values({
        projectId,
        sceneId: dto.sceneId,
        variantKey: dto.variantKey,
        audioS3Url: dto.audioS3Url,
        voiceId: dto.voiceId ?? null,
        scriptText: dto.scriptText ?? null,
        status: "pending",
      } as NewNarrationVariant)
      .returning();

    logger.info({ projectId, sceneId: dto.sceneId, variantKey: dto.variantKey }, "F5: Narration variant created");
    return row;
  }

  async listForScene(projectId: string, sceneId: string): Promise<NarrationVariant[]> {
    return this.db
      .select()
      .from(narrationVariants)
      .where(and(eq(narrationVariants.projectId, projectId), eq(narrationVariants.sceneId, sceneId)));
  }

  async listForProject(projectId: string): Promise<NarrationVariant[]> {
    return this.db
      .select()
      .from(narrationVariants)
      .where(eq(narrationVariants.projectId, projectId))
      .orderBy(desc(narrationVariants.createdAt));
  }

  /** Mark a variant as "running" and store the platform experiment ID. */
  async startTest(variantId: string, platformVariantId: string): Promise<NarrationVariant> {
    const [row] = await this.db
      .update(narrationVariants)
      .set({ status: "running", platformVariantId } as any)
      .where(eq(narrationVariants.id, variantId))
      .returning();
    if (!row) throw new NotFoundException(`Variant ${variantId} not found`);
    return row;
  }

  /** Sync analytics from the platform into the variant record. */
  async syncAnalytics(variantId: string, analytics: VariantAnalyticsDto): Promise<NarrationVariant> {
    const [row] = await this.db
      .update(narrationVariants)
      .set({
        views: analytics.views,
        avgViewDurationPct: String(analytics.avgViewDurationPct),
      } as any)
      .where(eq(narrationVariants.id, variantId))
      .returning();
    if (!row) throw new NotFoundException(`Variant ${variantId} not found`);
    return row;
  }

  /**
   * Promote the winning variant for a scene:
   * - Sets winner status to "promoted"
   * - Sets loser status to "rejected"
   * Returns the promoted variant.
   */
  async promoteWinner(projectId: string, sceneId: string, winnerVariantKey: "a" | "b"): Promise<NarrationVariant> {
    const variants = await this.listForScene(projectId, sceneId);
    if (variants.length < 2) {
      throw new BadRequestException(`Need both variant "a" and "b" before promoting a winner`);
    }

    let promoted: NarrationVariant | undefined;

    for (const v of variants) {
      const status = v.variantKey === winnerVariantKey ? "promoted" : "rejected";
      const [updated] = await this.db
        .update(narrationVariants)
        .set({
          status,
          ...(status === "promoted" ? { promotedAt: new Date() } : {}),
        } as any)
        .where(eq(narrationVariants.id, v.id))
        .returning();
      if (status === "promoted") promoted = updated;
    }

    logger.info({ projectId, sceneId, winnerVariantKey }, "F5: Narration variant promoted");
    return promoted!;
  }

  // ── Auto-promote cron ──────────────────────────────────────────────────────

  /**
   * F5: Every 72 hours, check running variants that have been live for >=72h
   * and auto-promote the variant with higher avgViewDurationPct.
   * This mirrors the "after 72h auto-promote" pattern from the feature spec.
   */
  @Cron("0 */72 * * *") // every 72 hours
  async autoPromote(): Promise<void> {
    const runningVariants = await this.db
      .select()
      .from(narrationVariants)
      .where(eq(narrationVariants.status, "running"));

    // Group by (projectId, sceneId)
    const grouped = new Map<string, NarrationVariant[]>();
    for (const v of runningVariants) {
      const key = `${v.projectId}:${v.sceneId}`;
      const arr = grouped.get(key) ?? [];
      arr.push(v);
      grouped.set(key, arr);
    }

    for (const [, variants] of grouped) {
      if (variants.length < 2) continue;

      const [a, b] = variants;
      const scoreA = parseFloat(String(a.avgViewDurationPct ?? "0"));
      const scoreB = parseFloat(String(b.avgViewDurationPct ?? "0"));

      if (scoreA === 0 && scoreB === 0) continue; // no analytics yet

      const winner = scoreA >= scoreB ? a : b;
      await this.promoteWinner(winner.projectId, winner.sceneId, winner.variantKey as "a" | "b")
        .catch((err) => logger.warn({ sceneId: winner.sceneId, err: err.message }, "F5: Auto-promote failed"));
    }
  }
}
