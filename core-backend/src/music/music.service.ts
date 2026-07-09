import { Injectable } from "@nestjs/common";
import pino from "pino";
import { MusicProviderRegistry } from "./music-provider-registry";
import { MusicCacheService } from "./music-cache.service";
import type { MusicGenerateParams, MusicMood, MusicTrack } from "./music.types";

/** I04: Mood → typical BPM mapping for beat-sync scene cuts. */
const MOOD_BPM: Record<MusicMood, number> = {
  cinematic:  65,
  calm:       75,
  dramatic:   90,
  inspiring: 100,
  upbeat:    120,
  fun:       128,
};

const logger = pino({ level: "info" });

/**
 * Orchestrates music generation:
 *   1. Check DB cache (by mood+duration bucket)
 *   2. Delegate to MusicProviderRegistry (scored fallback)
 *   3. Persist result to DB cache
 */
@Injectable()
export class MusicService {
  constructor(
    private readonly registry: MusicProviderRegistry,
    private readonly cache: MusicCacheService,
  ) {}

  async generate(params: MusicGenerateParams): Promise<MusicTrack> {
    const hash = this.cache.computeHash(params);

    const cached = await this.cache.get(hash);
    if (cached) {
      logger.info({ hash, mood: params.mood, provider: cached.provider }, "Music cache hit");
      return cached;
    }

    logger.info({ hash, mood: params.mood, durationSeconds: params.durationSeconds }, "Music cache miss — generating");

    const track = await this.registry.generate(params);
    const annotated = this.annotateBpm(track); // I04

    await this.cache.save(hash, annotated);
    logger.info({ hash, provider: annotated.provider, title: annotated.title, bpm: annotated.bpm }, "Music track cached");

    return annotated;
  }

  async getProviderStatus() {
    return this.registry.getProviderStatus();
  }

  // ── I04: BPM annotation ───────────────────────────────────────────────────

  /** Annotate a MusicTrack with mood-derived BPM and beat timestamps. */
  annotateBpm(track: MusicTrack): MusicTrack {
    const bpm = MOOD_BPM[track.mood] ?? 90;
    return { ...track, bpm, beatTimestamps: this.beatTimestamps(bpm, track.durationSeconds) };
  }

  /** Generate beat timestamps (seconds) for a track given BPM and duration. */
  beatTimestamps(bpm: number, durationSeconds: number): number[] {
    const interval = 60 / bpm;
    const stamps: number[] = [];
    for (let t = 0; t < durationSeconds; t += interval) {
      stamps.push(Math.round(t * 100) / 100);
    }
    return stamps;
  }
}
