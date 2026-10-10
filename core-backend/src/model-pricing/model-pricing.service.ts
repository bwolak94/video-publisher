import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { CreateModelPricingDto } from "./dto/create-model-pricing.dto";
import { UpdateModelPricingDto } from "./dto/update-model-pricing.dto";

type DrizzleDb = NodePgDatabase<typeof schema>;

export interface PricingRow {
  id: string;
  role: string;
  model: string;
  endpoint: string;
  price_per_unit: string | number;
  unit: string;
  license: string | null;
  is_active: boolean;
  tag: string | null;
  updated_at: Date;
  created_at: Date;
}

export interface EstimateResult {
  min: number;
  max: number;
  breakdown: Array<{ role: string; model: string; units: number; cost: number }>;
}

@Injectable()
export class ModelPricingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Returns all pricing rows ordered by role then model.
   */
  async findAll(): Promise<PricingRow[]> {
    const rows = await this.db.execute(
      sql`SELECT * FROM model_pricing ORDER BY role, model`,
    );
    return (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as PricingRow[];
  }

  /**
   * Inserts a new pricing entry and returns the created row.
   */
  async create(dto: CreateModelPricingDto): Promise<PricingRow> {
    const rows = await this.db.execute(sql`
      INSERT INTO model_pricing (role, model, endpoint, price_per_unit, unit, license, tag)
      VALUES (
        ${dto.role},
        ${dto.model},
        ${dto.endpoint},
        ${dto.pricePerUnit},
        ${dto.unit},
        ${dto.license ?? "commercial"},
        ${dto.tag ?? null}
      )
      RETURNING *
    `);
    return (Array.isArray(rows) ? rows : (rows as any).rows ?? [])[0] as PricingRow;
  }

  /**
   * Partially updates a pricing entry. Only price_per_unit, endpoint, and
   * license are patchable to prevent accidental role/model mutations.
   */
  async update(id: string, dto: UpdateModelPricingDto): Promise<PricingRow> {
    const updates: string[] = [];

    if (dto.pricePerUnit !== undefined) {
      updates.push(`price_per_unit = ${Number(dto.pricePerUnit)}`);
    }
    if (dto.endpoint !== undefined) {
      // Escape single quotes to prevent SQL injection
      updates.push(`endpoint = '${dto.endpoint.replace(/'/g, "''")}'`);
    }
    if (dto.license !== undefined) {
      updates.push(`license = '${dto.license.replace(/'/g, "''")}'`);
    }
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      // Only updated_at was added — no real fields changed
      throw new BadRequestException("No fields to update");
    }

    const rows = await this.db.execute(sql`
      UPDATE model_pricing
      SET ${sql.raw(updates.join(", "))}
      WHERE id = ${id}
      RETURNING *
    `);

    const row = (Array.isArray(rows) ? rows : (rows as any).rows ?? [])[0] as
      | PricingRow
      | undefined;

    if (!row) {
      throw new NotFoundException(`Entry ${id} not found`);
    }

    return row;
  }

  /**
   * Soft-deletes a pricing entry by setting is_active = false.
   */
  async deactivate(id: string): Promise<{ status: string }> {
    await this.db.execute(
      sql`UPDATE model_pricing SET is_active = false WHERE id = ${id}`,
    );
    return { status: "deactivated" };
  }

  /**
   * Estimates cost for a scene plan.
   *
   * Returns `{ min, max, breakdown }` where max = min * 1.3 (30 % re-generation
   * buffer). Only rows with `is_active = true` are considered.
   *
   * @param scenes    Array of scene objects from the storyboard / scene plan.
   * @param shotTrack Pipeline track — drives video model selection ("v2v" | other).
   */
  async estimateCost(scenes: any[], shotTrack: string): Promise<EstimateResult> {
    const pricing = await this.findAll();

    const lookup = (role: string): PricingRow | undefined =>
      pricing.find((p) => p.role === role && p.is_active);

    let totalMin = 0;
    const breakdown: EstimateResult["breakdown"] = [];

    for (const scene of scenes) {
      // T2I keyframes — 2 variants per scene
      const t2i = lookup("t2i");
      if (t2i) {
        const cost = 2 * Number(t2i.price_per_unit);
        totalMin += cost;
        breakdown.push({ role: "t2i", model: t2i.model, units: 2, cost });
      }

      // I2V / V2V — billed per second of generated video
      const duration: number = (scene.duration_s as number | undefined) ?? 5;
      let vidRole = "i2v-default";
      if (shotTrack === "v2v") {
        vidRole = "v2v";
      } else if ((scene.model_hint as string | undefined) === "action") {
        vidRole = "i2v-action";
      }

      const vid = lookup(vidRole);
      if (vid) {
        const cost = duration * Number(vid.price_per_unit);
        totalMin += cost;
        breakdown.push({ role: vidRole, model: vid.model, units: duration, cost });
      }

      // TTS — ElevenLabs billed per 1k chars (approx 5 chars/word)
      if (scene.voiceover) {
        const wordCount = (scene.voiceover as string).split(/\s+/).length;
        const tts = lookup("tts");
        if (tts) {
          const chars = wordCount * 5;
          const cost = (chars / 1000) * Number(tts.price_per_unit);
          totalMin += cost;
          breakdown.push({ role: "tts", model: tts.model, units: chars, cost });
        }
      }
    }

    // QA — flat cost per scene
    const qa = lookup("qa");
    if (qa) {
      const cost = scenes.length * Number(qa.price_per_unit);
      totalMin += cost;
      breakdown.push({ role: "qa", model: qa.model, units: scenes.length, cost });
    }

    // Render — single flat fee per project
    const render = lookup("render");
    if (render) {
      const cost = Number(render.price_per_unit);
      totalMin += cost;
      breakdown.push({ role: "render", model: render.model, units: 1, cost });
    }

    return {
      min: Math.round(totalMin * 100) / 100,
      max: Math.round(totalMin * 1.3 * 100) / 100,
      breakdown,
    };
  }
}
