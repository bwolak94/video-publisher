import { Injectable, Inject } from "@nestjs/common";
import * as crypto from "crypto";
import pino from "pino";
import { REDIS_CLIENT } from "../redis/redis.module";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — PRD NFR-6.1.2
const KEY_PREFIX = "image:";

const logger = pino({ level: "info" });

@Injectable()
export class ImageCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /**
   * Cache key: sha256(visualPrompt + modelId + size) — PRD NFR-6.1.2
   */
  computeCacheKey(visualPrompt: string, modelId: string, size: string): string {
    return crypto
      .createHash("sha256")
      .update(visualPrompt + modelId + size)
      .digest("hex");
  }

  async getCached(cacheKey: string): Promise<string | null> {
    const url = await this.redis.get(KEY_PREFIX + cacheKey);
    if (url) {
      logger.info({ event: "cache_hit", cacheKey, service: "dalle3" }, "Image cache hit");
    }
    return url ?? null;
  }

  async setCached(cacheKey: string, s3Url: string): Promise<void> {
    await this.redis.set(KEY_PREFIX + cacheKey, s3Url, "EX", TTL_SECONDS);
    logger.info({ event: "cache_write", cacheKey, s3Url }, "Image URL cached");
  }
}
