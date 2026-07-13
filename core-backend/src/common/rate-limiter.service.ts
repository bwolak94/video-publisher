/**
 * I3: Redis-backed sliding-window rate limiter for external API providers.
 *
 * Prevents 429s from ElevenLabs (3 concurrent), Runway (5 req/min), and DALL-E (5 req/min)
 * by self-throttling workers before each API call.
 *
 * Uses a Redis sorted set where each member is a unique request ID and the score is the
 * Unix timestamp of the request. Old entries (outside the window) are pruned on each call.
 */
import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

const logger = pino({ level: "info" });

/** Default per-provider limits. Override via `throttle()` params. */
export const PROVIDER_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  elevenlabs: { limit: 3,  windowMs: 1_000 },   // 3 concurrent
  runway:     { limit: 5,  windowMs: 60_000 },   // 5 req/min
  dalle3:     { limit: 5,  windowMs: 60_000 },   // 5 req/min
  kling:      { limit: 3,  windowMs: 60_000 },
  pexels:     { limit: 20, windowMs: 60_000 },
};

const MAX_WAIT_MS  = 60_000; // give up after 60s of waiting
const POLL_INTERVAL_MS = 300;

@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Block until the provider's rate limit allows the call.
   * Throws if the rate limit cannot be acquired within MAX_WAIT_MS.
   */
  async throttle(provider: string, limit?: number, windowMs?: number): Promise<void> {
    const cfg   = PROVIDER_LIMITS[provider];
    const cap   = limit   ?? cfg?.limit   ?? 10;
    const win   = windowMs ?? cfg?.windowMs ?? 60_000;
    const key   = `rate-limit:${provider}`;
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      const now        = Date.now();
      const windowStart = now - win;
      const member     = `${now}-${Math.random().toString(36).slice(2)}`;

      // Atomic sliding-window check using a pipeline
      const [, , , count] = await (this.redis as any).pipeline()
        .zremrangebyscore(key, "-inf", windowStart)
        .zadd(key, now, member)
        .pexpire(key, win + 1_000)
        .zcard(key)
        .exec() as Array<[Error | null, unknown]>;

      const currentCount = (count?.[1] as number) ?? 0;

      if (currentCount <= cap) {
        return; // Under limit — proceed
      }

      // Over limit — remove the member we just added and wait
      await (this.redis as any).zrem(key, member);
      logger.info({ provider, currentCount, cap }, "I3: Rate limit reached — waiting");
      await this.sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`I3: Rate limit throttle timed out for provider "${provider}" after ${MAX_WAIT_MS}ms`);
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
