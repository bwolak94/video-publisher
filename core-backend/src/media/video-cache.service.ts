import { Injectable, Inject } from "@nestjs/common";
import * as crypto from "crypto";
import pino from "pino";
import { REDIS_CLIENT } from "../redis/redis.module";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — NFR-6.1.2
const KEY_PREFIX = "video:";
const URL_KEY_PREFIX = "video:url:";

const logger = pino({ level: "info" });

@Injectable()
export class VideoCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /**
   * Cache key: sha256(visualPrompt + modelId + resolution) — PRD NFR-6.1.2
   */
  computeCacheKey(visualPrompt: string, modelId: string, resolution: string): string {
    return crypto
      .createHash("sha256")
      .update(visualPrompt + modelId + resolution)
      .digest("hex");
  }

  async getCached(cacheKey: string): Promise<string | null> {
    const url = await this.redis.get(KEY_PREFIX + cacheKey);
    if (url) {
      logger.info({ event: "cache_hit", cacheKey, service: "video" }, "Video cache hit");
    }
    return url ?? null;
  }

  async setCached(cacheKey: string, s3Url: string): Promise<void> {
    await this.redis.set(KEY_PREFIX + cacheKey, s3Url, "EX", TTL_SECONDS);
    logger.info({ event: "cache_write", cacheKey, s3Url }, "Video URL cached");
  }

  /**
   * Idempotent download tracking (TASK-10 Rule #6).
   * Tracks external CDN URLs so the same source is never downloaded twice.
   */
  computeUrlHash(externalUrl: string): string {
    return crypto.createHash("sha256").update(externalUrl).digest("hex");
  }

  async getCachedByUrlHash(urlHash: string): Promise<string | null> {
    return (await this.redis.get(URL_KEY_PREFIX + urlHash)) ?? null;
  }

  async setCachedByUrlHash(urlHash: string, s3Url: string): Promise<void> {
    await this.redis.set(URL_KEY_PREFIX + urlHash, s3Url, "EX", TTL_SECONDS);
  }
}
