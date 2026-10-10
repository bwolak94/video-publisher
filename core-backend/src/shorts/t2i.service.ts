import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { fal } from "@fal-ai/client";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { S3Service } from "../storage/s3.service";

const logger = pino({ level: "info" });

export interface KeyframeVariant {
  id: string;
  s3Url: string;
  seed: number;
  similarity: number;
}

@Injectable()
export class T2iService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly s3Service: S3Service,
  ) {
    fal.config({ credentials: process.env.FAL_API_KEY ?? "" });
  }

  /**
   * Generates 2 keyframe image variants for the given scene using Flux/fal.ai.
   * Both variants are uploaded to S3 and persisted as scene_keyframes rows.
   * Returns only the successfully generated variants (failed fal.ai calls are
   * skipped, so the returned array may have 0–2 elements).
   */
  async generateKeyframes(jobId: string, sceneId: string): Promise<KeyframeVariant[]> {
    // 1. Load job + locate scene in the scene plan
    const rows = await this.db.execute(
      sql`SELECT scene_plan FROM shorts_jobs WHERE id = ${jobId}`,
    );
    if (!rows[0]) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const scenePlan = rows[0].scene_plan as any[];
    const scene = scenePlan.find((s: any) => s.scene_id === sceneId);
    if (!scene) {
      throw new NotFoundException(`Scene ${sceneId} not found in job ${jobId}`);
    }

    // 2. Generate 2 variants in parallel with independent random seeds
    const seeds = [
      Math.floor(Math.random() * 999_999_999),
      Math.floor(Math.random() * 999_999_999),
    ];

    const results = await Promise.allSettled(
      seeds.map((seed) =>
        fal.subscribe("fal-ai/flux/dev", {
          input: {
            prompt: scene.image_prompt as string,
            image_size: "portrait_4_3",
            num_inference_steps: 28,
            seed,
          },
        }),
      ),
    );

    const variants: KeyframeVariant[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      if (result.status === "rejected") {
        logger.warn(
          { jobId, sceneId, variantIndex: i, reason: String(result.reason) },
          "T2iService: fal.ai generation failed for variant, skipping",
        );
        continue;
      }

      const imageUrl: string | undefined = (result.value?.data as any)?.images?.[0]?.url;
      if (!imageUrl) {
        logger.warn(
          { jobId, sceneId, variantIndex: i },
          "T2iService: no image URL in fal.ai response, skipping",
        );
        continue;
      }

      // 3. Download image from fal.ai CDN and upload to S3
      let imgBuffer: Buffer;
      try {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching fal image`);
        imgBuffer = Buffer.from(await resp.arrayBuffer());
      } catch (err) {
        logger.warn(
          { jobId, sceneId, variantIndex: i, err },
          "T2iService: failed to download fal image, skipping",
        );
        continue;
      }

      const s3Key = `keyframes/${jobId}/${sceneId}/v${i}.jpg`;
      const s3Url = await this.s3Service.uploadBuffer(s3Key, imgBuffer, "image/jpeg");

      // 4. Persist to scene_keyframes
      const inserted = await this.db.execute(sql`
        INSERT INTO scene_keyframes (job_id, scene_id, variant_index, s3_url, seed, similarity)
        VALUES (${jobId}, ${sceneId}, ${i}, ${s3Url}, ${String(seeds[i])}, ${0.0})
        RETURNING id, s3_url, seed
      `);

      const row = inserted[0];
      variants.push({
        id: row.id as string,
        s3Url: row.s3_url as string,
        seed: seeds[i],
        similarity: 0,
      });

      logger.info({ jobId, sceneId, variantIndex: i, s3Url }, "T2iService: keyframe variant saved");
    }

    return variants;
  }

  /**
   * Marks a specific variant as accepted. All other variants for the same
   * scene remain as-is — the caller decides whether to display only the winner.
   */
  async acceptKeyframe(
    jobId: string,
    sceneId: string,
    variantId: string,
  ): Promise<{ status: string }> {
    await this.db.execute(sql`
      UPDATE scene_keyframes
      SET accepted = true
      WHERE id = ${variantId}
        AND job_id = ${jobId}
        AND scene_id = ${sceneId}
    `);
    logger.info({ jobId, sceneId, variantId }, "T2iService: keyframe accepted");
    return { status: "accepted" };
  }
}
