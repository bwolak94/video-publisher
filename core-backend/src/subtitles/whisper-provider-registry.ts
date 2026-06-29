/**
 * WhisperProviderRegistry — scored fallback selection for transcription providers.
 * Mirrors the VideoProviderRegistry pattern (FEATURE-01).
 *
 * Composite score = quality×3 + cost×2 + reliability×2 + latency×1
 * whisper_local: 5×3+5×2+3×2+3×1 = 34  (wins when ai-backend is reachable)
 * whisper_api:   5×3+2×2+5×2+4×1 = 33  (fallback with OpenAI key)
 */

import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { WhisperProvider } from "./whisper-provider.interface";
import type { TranscriptionResult } from "./subtitle.types";

const logger = pino({ level: "info" });

@Injectable()
export class WhisperProviderRegistry {
  private readonly providers: WhisperProvider[] = [];

  register(provider: WhisperProvider): void {
    this.providers.push(provider);
    logger.info({ provider: provider.name, scores: provider.scores }, "Whisper provider registered");
  }

  async transcribe(audioS3Url: string, language?: string): Promise<TranscriptionResult> {
    const ranked = await this.rankAvailableProviders();

    if (ranked.length === 0) {
      throw new Error(
        "No transcription providers available. " +
        "Either start the ai-backend service (for free local Whisper) " +
        "or add an OpenAI API key in Settings."
      );
    }

    logger.info(
      { audioS3Url, rankedProviders: ranked.map((p) => p.name) },
      "Starting transcription — provider order determined"
    );

    let lastError: Error | null = null;

    for (let i = 0; i < ranked.length; i++) {
      const provider = ranked[i];

      if (i > 0 && lastError) {
        logger.warn(
          { from: ranked[i - 1].name, to: provider.name, reason: lastError.message },
          "Falling back to next Whisper provider"
        );
      }

      try {
        return await provider.transcribe(audioS3Url, language);
      } catch (err: any) {
        lastError = err;
        logger.error({ provider: provider.name, error: err.message }, "Whisper provider failed");
      }
    }

    throw new Error(
      `All transcription providers failed. Last error: ${lastError?.message ?? "unknown"}. ` +
      `Tried: ${ranked.map((p) => p.name).join(", ")}`
    );
  }

  async getProviderStatus(): Promise<Array<{ name: string; available: boolean; score: number }>> {
    return Promise.all(
      this.providers.map(async (p) => ({
        name: p.name,
        available: await p.isAvailable().catch(() => false),
        score: this.composite(p.scores),
      }))
    );
  }

  private async rankAvailableProviders(): Promise<WhisperProvider[]> {
    const available: WhisperProvider[] = [];
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) available.push(provider);
      } catch {
        // treat availability check failure as unavailable
      }
    }
    return available.sort((a, b) => this.composite(b.scores) - this.composite(a.scores));
  }

  private composite(scores: WhisperProvider["scores"]): number {
    return scores.quality * 3 + scores.cost * 2 + scores.reliability * 2 + scores.latency * 1;
  }
}
