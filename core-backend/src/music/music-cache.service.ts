import { Injectable, Inject } from "@nestjs/common";
import { createHash } from "crypto";
import { eq, lt } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { musicCache } from "../db/schema";
import type { MusicGenerateParams, MusicMood, MusicProviderName, MusicTrack } from "./music.types";

/** I1: Cache TTL — 30 days. Tracks approaching this age trigger background refresh. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
/** I1: Refresh window — refresh within 24h of expiry without blocking the caller. */
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1_000;

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

    // I1: Treat expired entries as a cache miss (force regeneration)
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      return null;
    }

    return {
      s3Url:           row.s3Url,
      provider:        row.provider as MusicProviderName,
      mood:            row.mood as MusicMood,
      title:           row.title,
      artist:          row.artist ?? undefined,
      license:         row.license,
      durationSeconds: parseFloat(row.durationSeconds as string),
      generatedAt:     row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  /**
   * I1: Return hashes for tracks expiring within the next 24h.
   * Used by the background refresh cron in MusicService.
   */
  async getSoonToExpireHashes(): Promise<string[]> {
    const threshold = new Date(Date.now() + REFRESH_WINDOW_MS);
    const rows = await this.db
      .select({ paramsHash: musicCache.paramsHash })
      .from(musicCache)
      .where(lt(musicCache.expiresAt, threshold));
    return rows.map((r) => r.paramsHash);
  }

  async save(hash: string, track: MusicTrack): Promise<void> {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS); // I1: 30-day TTL
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
        expiresAt,
      })
      .onConflictDoUpdate({
        target: musicCache.paramsHash,
        set: {
          s3Url:           track.s3Url,
          provider:        track.provider,
          title:           track.title,
          artist:          track.artist ?? null,
          durationSeconds: String(track.durationSeconds),
          expiresAt,
        },
      });
  }
}
