import { Injectable, Inject } from "@nestjs/common";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { musicCache } from "../db/schema";
import type { MusicGenerateParams, MusicMood, MusicProviderName, MusicTrack } from "./music.types";

@Injectable()
export class MusicCacheService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /** Stable hash over (mood, targetDuration-bucketed-to-30s) */
  computeHash(params: Pick<MusicGenerateParams, "mood" | "durationSeconds">): string {
    // Bucket duration to nearest 30s so minor variations reuse the same track
    const durationBucket = Math.round(params.durationSeconds / 30) * 30;
    const payload = `${params.mood}:${durationBucket}`;
    return createHash("sha256").update(payload).digest("hex");
  }

  async get(hash: string): Promise<MusicTrack | null> {
    const rows = await this.db
      .select()
      .from(musicCache)
      .where(eq(musicCache.paramsHash, hash));

    if (!rows[0]) return null;
    const row = rows[0];
    return {
      s3Url:           row.s3Url,
      provider:        row.provider as MusicProviderName,
      mood:            row.mood as MusicMood,
      title:           row.title,
      artist:          row.artist ?? undefined,
      license:         row.license,
      durationSeconds: parseFloat(row.durationSeconds),
      generatedAt:     row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async save(hash: string, track: MusicTrack): Promise<void> {
    await this.db
      .insert(musicCache)
      .values({
        paramsHash:      hash,
        s3Url:           track.s3Url,
        provider:        track.provider,
        mood:            track.mood,
        title:           track.title,
        artist:          track.artist ?? null,
        license:         track.license,
        durationSeconds: String(track.durationSeconds),
      })
      .onConflictDoUpdate({
        target: musicCache.paramsHash,
        set: {
          s3Url:           track.s3Url,
          provider:        track.provider,
          title:           track.title,
          artist:          track.artist ?? null,
          durationSeconds: String(track.durationSeconds),
        },
      });
  }
}
