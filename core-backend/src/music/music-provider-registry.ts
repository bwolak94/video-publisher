import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { MusicProvider, MusicProviderScores } from "./music-provider.interface";
import type { MusicGenerateParams, MusicTrack } from "./music.types";

const logger = pino({ level: "info" });

/**
 * Scored provider selection registry for music generation.
 *
 * Composite score = quality×4 + cost×1 + reliability×2 + latency×1
 * (quality weighted highest — bad music degrades perceived video quality)
 */
@Injectable()
export class MusicProviderRegistry {
  private readonly providers: MusicProvider[] = [];

  register(provider: MusicProvider): void {
    this.providers.push(provider);
    logger.info({ provider: provider.name, scores: provider.scores }, "Music provider registered");
  }

  async generate(params: MusicGenerateParams): Promise<MusicTrack> {
    const ranked = await this.rankAvailableProviders();

    if (ranked.length === 0) {
      throw new Error("No music providers are available. Check settings or provider connectivity.");
    }

    logger.info(
      { projectId: params.projectId, mood: params.mood, rankedProviders: ranked.map((p) => p.name) },
      "Starting music generation — provider order determined"
    );

    let lastError: Error | null = null;

    for (let i = 0; i < ranked.length; i++) {
      const provider = ranked[i];

      if (i > 0 && lastError) {
        logger.warn(
          { from: ranked[i - 1].name, to: provider.name, reason: lastError.message },
          "Falling back to next music provider"
        );
      }

      try {
        logger.info({ provider: provider.name, mood: params.mood }, "Attempting music generation");
        const track = await provider.generate(params);
        logger.info({ provider: provider.name, title: track.title }, "Music generated successfully");
        return track;
      } catch (err: any) {
        lastError = err;
        logger.error({ provider: provider.name, error: err.message }, "Music provider failed");
      }
    }

    throw new Error(
      `All music providers failed. Last error: ${lastError?.message ?? "unknown"}. ` +
      `Tried: ${ranked.map((p) => p.name).join(", ")}`
    );
  }

  async getProviderStatus(): Promise<Array<{ name: string; available: boolean; score: number; scores: MusicProviderScores }>> {
    return Promise.all(
      this.providers.map(async (p) => ({
        name: p.name,
        available: await p.isAvailable().catch(() => false),
        score: this.composite(p.scores),
        scores: p.scores,
      }))
    );
  }

  private async rankAvailableProviders(): Promise<MusicProvider[]> {
    const available: MusicProvider[] = [];
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) available.push(provider);
      } catch {
        // treat availability check failure as unavailable
      }
    }
    return available.sort((a, b) => this.composite(b.scores) - this.composite(a.scores));
  }

  private composite(scores: MusicProviderScores): number {
    return scores.quality * 4 + scores.cost * 1 + scores.reliability * 2 + scores.latency * 1;
  }
}
