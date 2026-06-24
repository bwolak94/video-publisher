import { Injectable, Inject } from "@nestjs/common";
import * as crypto from "crypto";
import pino from "pino";
import { REDIS_CLIENT } from "../redis/redis.module";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const KEY_PREFIX = "audio:";

const logger = pino({ level: "info" });

@Injectable()
export class AudioCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /**
   * Cache key rule: sha256(narrationText + voiceId)
   * PRD NFR-6.1.1 / TASK-09 Rule #1
   */
  computeCacheKey(narrationText: string, voiceId: string): string {
    return crypto
      .createHash("sha256")
      .update(narrationText + voiceId)
      .digest("hex");
  }

  async getCached(cacheKey: string): Promise<string | null> {
    const url = await this.redis.get(KEY_PREFIX + cacheKey);
    if (url) {
      logger.info({ event: "cache_hit", cacheKey, service: "elevenlabs" }, "Audio cache hit");
    }
    return url ?? null;
  }

  async setCached(cacheKey: string, s3Url: string): Promise<void> {
    await this.redis.set(KEY_PREFIX + cacheKey, s3Url, "EX", TTL_SECONDS);
    logger.info({ event: "cache_write", cacheKey, s3Url }, "Audio URL cached");
  }
}
