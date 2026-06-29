/**
 * DB-backed cache for archival footage search results (FEATURE-02).
 *
 * Persists ranked `ArchivalFootageResult[]` per prompt hash for 7 days so
 * repeated requests for the same visual prompt skip all 3 source API calls.
 */

import { Injectable, Inject } from "@nestjs/common";
import * as crypto from "crypto";
import { eq, lt } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { archivalFootageCache } from "../db/schema";
import type { ArchivalFootageResult, ArchivalSource } from "./archival-footage.types";

const logger = pino({ level: "info" });
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class ArchivalFootageCacheService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /** SHA-256 of (visualPrompt + sorted sources) */
  computeHash(visualPrompt: string, sources: ArchivalSource[]): string {
    return crypto
      .createHash("sha256")
      .update(visualPrompt + [...sources].sort().join(","))
      .digest("hex");
  }

  async get(
    promptHash: string
  ): Promise<{ results: ArchivalFootageResult[]; s3Url: string | null } | null> {
    const rows = await this.db
      .select()
      .from(archivalFootageCache)
      .where(eq(archivalFootageCache.promptHash, promptHash));

    const row = rows[0];
    if (!row) return null;

    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      logger.info({ promptHash }, "Archival footage DB cache expired");
      return null;
    }

    logger.info({ promptHash, s3Url: row.s3Url }, "Archival footage DB cache hit");
    return {
      results: (row.results as ArchivalFootageResult[]) ?? [],
      s3Url: row.s3Url ?? null,
    };
  }

  async save(
    promptHash: string,
    results: ArchivalFootageResult[],
    s3Url?: string
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.db
      .insert(archivalFootageCache)
      .values({ promptHash, results, s3Url: s3Url ?? null, expiresAt })
      .onConflictDoUpdate({
        target: archivalFootageCache.promptHash,
        set: { results, s3Url: s3Url ?? null, expiresAt },
      });
    logger.info({ promptHash, resultCount: results.length }, "Archival footage search results cached");
  }

  async updateS3Url(promptHash: string, s3Url: string): Promise<void> {
    await this.db
      .update(archivalFootageCache)
      .set({ s3Url })
      .where(eq(archivalFootageCache.promptHash, promptHash));
    logger.info({ promptHash, s3Url }, "Archival footage cache s3Url updated");
  }

  /** Remove expired rows — call from a @Cron or on app startup */
  async purgeExpired(): Promise<void> {
    const result = await this.db
      .delete(archivalFootageCache)
      .where(lt(archivalFootageCache.expiresAt, new Date()));
    logger.info({ purged: result?.rowCount ?? 0 }, "Archival footage cache: expired rows purged");
  }
}
