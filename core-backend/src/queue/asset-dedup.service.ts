/**
 * I2: Asset-generation job deduplication via Redis distributed lock.
 *
 * Prevents two concurrent workers from generating the same asset (same content hash)
 * simultaneously, which would double provider spend and cause a race to write S3.
 *
 * Uses Redis SET NX EX pattern:
 *   - Acquires: SET lock:<hash> <workerId> NX EX <ttlSeconds>
 *   - If key already exists → wait for the first job to finish (poll cache)
 *   - Releases: DEL lock:<hash> (only if held by this worker)
 */

import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

const logger = pino({ level: "info" });

const LOCK_TTL_S = 120;     // 2 minutes — max expected generation time
const POLL_INTERVAL_MS = 500;
const POLL_MAX_WAIT_MS = 90_000;

@Injectable()
export class AssetDedupService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Try to acquire an exclusive lock for `hash`.
   * Returns true if this caller holds the lock; false if another worker already
   * held it AND generation finished (cache should now be warm — caller should skip).
   */
  async acquireOrSkip(hash: string, holderId: string): Promise<"acquired" | "skip"> {
    const key = `asset-lock:${hash}`;
    const acquired = await this.redis.set(key, holderId, "EX", LOCK_TTL_S, "NX");

    if (acquired === "OK") {
      return "acquired";
    }

    // Another worker holds the lock — wait for it to finish
    logger.info({ hash }, "I2: Waiting for duplicate asset generation to finish");
    const deadline = Date.now() + POLL_MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);
      const stillLocked = await this.redis.exists(key);
      if (!stillLocked) {
        // The other worker finished — caller should check cache and skip if warm
        return "skip";
      }
    }

    // Timed out — proceed anyway (better to duplicate than to stall)
    logger.warn({ hash }, "I2: Lock wait timed out — proceeding with generation");
    return "acquired";
  }

  /** Release the lock. No-op if held by a different worker (expired + reacquired). */
  async release(hash: string, holderId: string): Promise<void> {
    const key = `asset-lock:${hash}`;
    // Lua script: only delete if value matches holderId (atomic compare-and-delete)
    await this.redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      key,
      holderId,
    ).catch(() => {});
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
