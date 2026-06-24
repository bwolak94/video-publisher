import { Injectable, Inject } from "@nestjs/common";
import { REDIS_CLIENT } from "../redis/redis.module";

const EVENT_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class EventCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  async cacheEvent(projectId: string, step: string, event: object): Promise<void> {
    const key = `project_events:${projectId}`;
    await this.redis.hset(key, step, JSON.stringify(event));
    await this.redis.expire(key, EVENT_TTL_SECONDS);
  }

  async getCachedEvents(projectId: string): Promise<object[]> {
    const key = `project_events:${projectId}`;
    const hash: Record<string, string> | null = await this.redis.hgetall(key);
    if (!hash) return [];
    return Object.values(hash).map((v) => JSON.parse(v));
  }
}
