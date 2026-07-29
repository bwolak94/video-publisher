import { Injectable, Inject } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

@Injectable()
export class CronLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Attempt to acquire a distributed cron lock.
   * Returns true if the lock was acquired (this instance should run the job).
   * Returns false if another instance already holds the lock.
   */
  async acquire(lockName: string, ttlSeconds: number): Promise<boolean> {
    const key = `cron-lock:${lockName}`;
    const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async release(lockName: string): Promise<void> {
    await this.redis.del(`cron-lock:${lockName}`);
  }
}
