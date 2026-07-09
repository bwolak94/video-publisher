import { Controller, Get, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { REDIS_CLIENT } from "../redis/redis.module";
import { configuration } from "../config/configuration";

@Controller()
export class HealthController {
  private readonly aiBackendUrl: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    @Inject("DB_POOL") private readonly dbPool: any
  ) {
    this.aiBackendUrl = configuration().worker.aiBackendUrl;
  }

  @Get("health")
  getHealth() {
    return { status: "ok" };
  }

  @Get("ready")
  async getReady() {
    const [redisCheck, dbCheck, s3Check, aiCheck] = await Promise.allSettled([
      this.timedCheck(() => this.checkRedis()),
      this.timedCheck(() => this.checkDb()),
      this.timedCheck(() => this.checkS3()),
      this.timedCheck(() => this.checkAiBackend()),
    ]);

    const allOk = [redisCheck, dbCheck, s3Check, aiCheck].every((c) => c.status === "fulfilled");

    const details = {
      redis:      this.toDetail(redisCheck),
      db:         this.toDetail(dbCheck),
      s3:         this.toDetail(s3Check),
      aiBackend:  this.toDetail(aiCheck),
    };

    if (!allOk) {
      throw new HttpException({ status: "not_ready", checks: details }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return { status: "ready", checks: details };
  }

  // ── Checks ──────────────────────────────────────────────────────────────────

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

  /** HEAD request to S3 endpoint — verifies bucket reachability without reading objects. */
  private async checkS3(): Promise<void> {
    const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
    const bucket   = process.env.S3_BUCKET   ?? "video-assets";
    const res = await fetch(`${endpoint}/${bucket}`, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    // 200 (public) or 403 (private but reachable) are both acceptable
    if (res.status >= 500) {
      throw new Error(`S3 returned ${res.status}`);
    }
  }

  /** GET /health on the Python ai-backend. */
  private async checkAiBackend(): Promise<void> {
    const res = await fetch(`${this.aiBackendUrl}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      throw new Error(`ai-backend returned ${res.status}`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async timedCheck(fn: () => Promise<void>): Promise<{ latencyMs: number }> {
    const start = Date.now();
    await fn();
    return { latencyMs: Date.now() - start };
  }

  private toDetail(result: PromiseSettledResult<{ latencyMs: number }>): { status: string; latencyMs?: number; error?: string } {
    if (result.status === "fulfilled") {
      return { status: "ok", latencyMs: result.value.latencyMs };
    }
    return { status: "error", error: String((result as PromiseRejectedResult).reason) };
  }
}
