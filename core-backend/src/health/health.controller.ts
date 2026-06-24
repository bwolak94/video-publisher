import { Controller, Get, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { REDIS_CLIENT } from "../redis/redis.module";

@Controller()
export class HealthController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    @Inject("DB_POOL") private readonly dbPool: any
  ) {}

  @Get("health")
  getHealth() {
    return { status: "ok" };
  }

  @Get("ready")
  async getReady() {
    const checks = await Promise.allSettled([
      this.checkRedis(),
      this.checkDb(),
    ]);

    const [redisCheck, dbCheck] = checks;
    const allOk = checks.every((c) => c.status === "fulfilled");

    if (!allOk) {
      const errors: Record<string, string> = {};
      if (redisCheck.status === "rejected") errors.redis = String((redisCheck as PromiseRejectedResult).reason);
      if (dbCheck.status === "rejected") errors.db = String((dbCheck as PromiseRejectedResult).reason);
      throw new HttpException({ status: "not_ready", errors }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return { status: "ready", checks: { redis: "ok", db: "ok" } };
  }

  private async checkRedis(): Promise<void> {
    await this.redis.ping();
  }

  private async checkDb(): Promise<void> {
    const client = await this.dbPool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  }
}
