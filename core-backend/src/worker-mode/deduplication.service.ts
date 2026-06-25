import { Injectable, Inject } from "@nestjs/common";
import { createHash } from "crypto";
import { REDIS_CLIENT } from "../redis/redis.module";

const DEDUP_KEY_PREFIX = "dedup:topics:";

@Injectable()
export class DeduplicationService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  async isDuplicate(topic: string): Promise<boolean> {
    const key = this.buildKey(topic);
    const result = await this.redis.get(key);
    return result !== null;
  }

  async markSeen(topic: string, windowHours: number): Promise<void> {
    const key = this.buildKey(topic);
    const ttlSeconds = windowHours * 3600;
    await this.redis.set(key, "1", "EX", ttlSeconds);
  }

  private buildKey(topic: string): string {
    const hash = createHash("sha256")
      .update(topic.toLowerCase().trim())
      .digest("hex");
    return `${DEDUP_KEY_PREFIX}${hash}`;
  }
}
