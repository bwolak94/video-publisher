import { Injectable } from "@nestjs/common";
import pino from "pino";
import { MusicProviderRegistry } from "./music-provider-registry";
import { MusicCacheService } from "./music-cache.service";
import type { MusicGenerateParams, MusicTrack } from "./music.types";

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

    await this.cache.save(hash, track);
    logger.info({ hash, provider: track.provider, title: track.title }, "Music track cached");

    return track;
  }

  async getProviderStatus() {
    return this.registry.getProviderStatus();
  }
}
