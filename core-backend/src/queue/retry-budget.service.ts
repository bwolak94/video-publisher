/**
 * I8: Per-project daily retry budget.
 *
 * Tracks total BullMQ retry attempts per project per day in Redis.
 * Workers call `checkAndIncrement()` at the top of each job; if the budget is
 * exhausted an `UnrecoverableError` is thrown which prevents further BullMQ retries.
 */
import { Injectable, Inject } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

const logger = pino({ level: "info" });

/** Maximum retries across ALL jobs for one project in a calendar day. */
const DEFAULT_DAILY_LIMIT = 20;

@Injectable()
export class RetryBudgetService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Increment the retry counter for this project and throw `UnrecoverableError`
   * if the daily budget is exhausted.
   *
   * Call at the START of each worker's `process()` after the first attempt
   * (attempt > 1 means it's a retry).
   */
  async checkAndIncrement(projectId: string, attemptsMade: number, limit = DEFAULT_DAILY_LIMIT): Promise<void> {
    if (attemptsMade <= 1) return; // first attempt — not a retry, don't count

    const date = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const key = `retry-budget:${projectId}:${date}`;
    const TTL_SECONDS = 90_000; // ~25h — auto-expires after midnight

    // Atomic INCR + conditional EXPIRE via Lua to avoid a race between
    // incr() and expire() when two workers process the same project concurrently.
    const script = `
      local val = redis.call('incr', KEYS[1])
      if val == 1 then redis.call('expire', KEYS[1], ARGV[1]) end
      return val
    `;
    const count = await this.redis.eval(script, 1, key, TTL_SECONDS) as number;

    if (count > limit) {
      logger.warn({ projectId, count, limit }, "I8: Daily retry budget exhausted — marking job unrecoverable");
      throw new UnrecoverableError(
        `Daily retry budget exhausted for project ${projectId} (${count}/${limit} retries today)`
      );
    }
  }

  /** Read the current day's retry count for a project (for diagnostics). */
  async getCount(projectId: string): Promise<number> {
    const date = new Date().toISOString().slice(0, 10);
    const val = await this.redis.get(`retry-budget:${projectId}:${date}`);
    return val ? parseInt(val, 10) : 0;
  }
}
