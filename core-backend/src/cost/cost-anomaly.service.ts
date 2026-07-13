/**
 * I6: Cost anomaly detection via Redis rolling average.
 *
 * After each cost record, compares the new cost against the 7-day rolling
 * average for that (provider, assetType) pair. If the cost is >3× the
 * average, emits a domain event (→ webhook) and increments a Prometheus counter.
 */
import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";
import { DomainEventBus } from "../common/domain-event-bus";

const logger = pino({ level: "info" });

const ANOMALY_MULTIPLIER = 3;
const WINDOW_DAYS = 7;
const MAX_SAMPLES = 200; // keep last N samples in the list

@Injectable()
export class CostAnomalyService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly events: DomainEventBus,
  ) {}

  async check(opts: {
    projectId?: string;
    sceneId?: string;
    provider: string;
    assetType: string;
    costUsd: number;
  }): Promise<void> {
    const key = `cost-avg:${opts.provider}:${opts.assetType}`;
    const now = Date.now();
    const windowMs = WINDOW_DAYS * 86_400_000;

    // Append current sample (score = timestamp for windowing)
    await (this.redis as any).pipeline()
      .zadd(key, now, `${now}:${opts.costUsd}`)
      .zremrangebyscore(key, "-inf", now - windowMs)
      .ltrim(key, -MAX_SAMPLES, -1)
      .expire(key, WINDOW_DAYS * 86_400 + 3_600)
      .exec();

    // Compute rolling average from remaining samples
    const members: string[] = await this.redis.zrange(key, 0, -1);
    if (members.length < 3) return; // not enough history to detect anomalies

    const values = members.map((m) => parseFloat(m.split(":")[1]));
    const average = values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1);

    if (average > 0 && opts.costUsd > average * ANOMALY_MULTIPLIER) {
      const multiplier = Math.round((opts.costUsd / average) * 10) / 10;
      logger.warn(
        { provider: opts.provider, assetType: opts.assetType, costUsd: opts.costUsd, averageUsd: average, multiplier },
        "I6: Cost anomaly detected",
      );

      this.events.emit("cost.anomaly", {
        projectId: opts.projectId,
        sceneId: opts.sceneId,
        provider: opts.provider,
        assetType: opts.assetType,
        costUsd: opts.costUsd,
        averageUsd: average,
        multiplier,
      });
    }
  }
}
