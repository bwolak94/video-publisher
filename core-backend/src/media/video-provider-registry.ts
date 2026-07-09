import { Injectable } from "@nestjs/common";
import pino from "pino";
import { MetricsService } from "../metrics/metrics.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";

const logger = pino({ level: "info" });

/**
 * Scored provider selection registry (FEATURE-01).
 *
 * Algorithm:
 *  1. Filter providers where isAvailable() === true
 *  2. Compute composite score = quality*3 + cost*2 + reliability*2 + latency*1  (weighted)
 *  3. Sort descending by composite score
 *  4. Try providers in order; on failure fall through to next
 *  5. Emit Prometheus metrics for every attempt, success, and fallback
 */
interface RollingWindow {
  success: number;
  failure: number;
  windowStartMs: number;
}

const ROLLING_WINDOW_MS = 10 * 60 * 1_000; // 10 minutes

@Injectable()
export class VideoProviderRegistry {
  private readonly providers: VideoProvider[] = [];
  /** I02: last error timestamp per provider (epoch ms) */
  private readonly lastErrorAt = new Map<string, number>();
  /** I02: rolling 10-min success/failure counts per provider */
  private readonly rolling = new Map<string, RollingWindow>();

  constructor(private readonly metrics: MetricsService) {}

  register(provider: VideoProvider): void {
    this.providers.push(provider);
    logger.info({ provider: provider.name, scores: provider.scores }, "Video provider registered");
  }

  /**
   * Generate video using the best available provider.
   * Falls through all available providers before throwing.
   */
  async generate(params: VideoGenerateParams): Promise<{ s3Url: string; provider: string }> {
    const ranked = await this.rankAvailableProviders();

    if (ranked.length === 0) {
      throw new Error("No video providers are configured. Add at least one API key in Settings.");
    }

    logger.info(
      { sceneId: params.sceneId, rankedProviders: ranked.map((p) => p.name) },
      "Starting video generation — provider order determined"
    );

    let lastError: Error | null = null;

    for (let i = 0; i < ranked.length; i++) {
      const provider = ranked[i];
      const isFallback = i > 0;

      if (isFallback && lastError) {
        logger.warn(
          { sceneId: params.sceneId, from: ranked[i - 1].name, to: provider.name, reason: lastError.message },
          "Falling back to next video provider"
        );
        this.metrics.videoProviderFallbackTotal
          .labels({ from_provider: ranked[i - 1].name, to_provider: provider.name })
          .inc();
      }

      const timer = this.metrics.videoProviderDurationSeconds.labels({ provider: provider.name }).startTimer();

      try {
        logger.info({ sceneId: params.sceneId, provider: provider.name }, "Attempting video generation");
        const s3Url = await provider.generate(params);

        timer({ status: "success" });
        this.metrics.videoProviderRequestsTotal.labels({ provider: provider.name, status: "success" }).inc();
        this.recordRolling(provider.name, "success"); // I02

        logger.info({ sceneId: params.sceneId, provider: provider.name, s3Url }, "Video generated successfully");
        return { s3Url, provider: provider.name };
      } catch (err: any) {
        lastError = err;
        timer({ status: "error" });
        this.metrics.videoProviderRequestsTotal.labels({ provider: provider.name, status: "error" }).inc();
        this.metrics.externalApiErrorsTotal.labels({ service: provider.name }).inc();
        this.lastErrorAt.set(provider.name, Date.now()); // I02
        this.recordRolling(provider.name, "failure");   // I02

        logger.error(
          { sceneId: params.sceneId, provider: provider.name, error: err.message },
          "Video provider failed"
        );
      }
    }

    throw new Error(
      `All video providers failed. Last error: ${lastError?.message ?? "unknown"}. ` +
      `Tried: ${ranked.map((p) => p.name).join(", ")}`
    );
  }

  private async rankAvailableProviders(): Promise<VideoProvider[]> {
    const available: VideoProvider[] = [];

    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) {
          available.push(provider);
        }
      } catch {
        // availability check failure = treat as unavailable
      }
    }

    return available.sort((a, b) => this.composite(b.scores) - this.composite(a.scores));
  }

  /** Weighted composite score — quality matters most, then cost, then reliability, then latency */
  private composite(scores: ProviderScores): number {
    return scores.quality * 3 + scores.cost * 2 + scores.reliability * 2 + scores.latency * 1;
  }

  /** I02: For health checks — includes live circuit state, last error, and rolling success rate. */
  async getProviderStatus(): Promise<Array<{
    name: string;
    available: boolean;
    score: number;
    scores: ProviderScores;
    lastErrorAt: string | null;
    successRatePct: number | null;
  }>> {
    return Promise.all(
      this.providers.map(async (p) => {
        const errTs = this.lastErrorAt.get(p.name);
        const win = this.rollingWindow(p.name);
        const total = win.success + win.failure;
        return {
          name: p.name,
          available: await p.isAvailable().catch(() => false),
          score: this.composite(p.scores),
          scores: p.scores,
          lastErrorAt: errTs ? new Date(errTs).toISOString() : null,
          successRatePct: total > 0 ? Math.round((win.success / total) * 100) : null,
        };
      })
    );
  }

  // ── I02: Rolling window helpers ────────────────────────────────────────────

  private recordRolling(name: string, outcome: "success" | "failure"): void {
    const win = this.rollingWindow(name);
    if (outcome === "success") win.success++; else win.failure++;
  }

  private rollingWindow(name: string): RollingWindow {
    const now = Date.now();
    let win = this.rolling.get(name);
    if (!win || now - win.windowStartMs > ROLLING_WINDOW_MS) {
      win = { success: 0, failure: 0, windowStartMs: now };
      this.rolling.set(name, win);
    }
    return win;
  }
}
