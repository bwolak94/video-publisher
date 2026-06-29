/**
 * DB-backed subtitle cache (FEATURE-04).
 *
 * Cache key: SHA-256 of the audio S3 URL.
 * Transcription results are deterministic for the same audio file,
 * so no TTL — entries are kept indefinitely.
 */

import { Injectable, Inject } from "@nestjs/common";
import * as crypto from "crypto";
import { eq } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { subtitleCache } from "../db/schema";
import type { SubtitleTrack, WordTimestamp } from "./subtitle.types";

const logger = pino({ level: "info" });

@Injectable()
export class SubtitleCacheService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  computeHash(audioS3Url: string): string {
    return crypto.createHash("sha256").update(audioS3Url).digest("hex");
  }

  async get(audioHash: string): Promise<SubtitleTrack | null> {
    const rows = await this.db
      .select()
      .from(subtitleCache)
      .where(eq(subtitleCache.audioHash, audioHash));

    const row = rows[0];
    if (!row) return null;

    logger.info({ audioHash }, "Subtitle cache hit");
    return {
      words: (row.words as WordTimestamp[]) ?? [],
      srtS3Url: row.srtS3Url,
      vttS3Url: row.vttS3Url,
      language: row.language,
      provider: row.provider as SubtitleTrack["provider"],
      generatedAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async save(audioHash: string, track: SubtitleTrack): Promise<void> {
    await this.db
      .insert(subtitleCache)
      .values({
        audioHash,
        words: track.words,
        language: track.language,
        srtS3Url: track.srtS3Url,
        vttS3Url: track.vttS3Url,
        provider: track.provider,
      })
      .onConflictDoUpdate({
        target: subtitleCache.audioHash,
        set: {
          words: track.words,
          language: track.language,
          srtS3Url: track.srtS3Url,
          vttS3Url: track.vttS3Url,
          provider: track.provider,
        },
      });

    logger.info({ audioHash, wordCount: track.words.length, provider: track.provider }, "Subtitle track cached");
  }
}
