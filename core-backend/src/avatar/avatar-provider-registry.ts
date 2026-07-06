/**
 * AvatarProviderRegistry — scored fallback selection for avatar video providers (FEATURE-11).
 *
 * Composite score = quality×3 + cost×2 + reliability×2 + latency×1
 *   wav2lip_local: 3×3+5×2+3×2+4×1 = 9+10+6+4 = 29  (preferred when ai-backend reachable)
 *   heygen:        5×3+1×2+4×2+2×1 = 15+2+8+2 = 27
 *   did:           4×3+2×2+4×2+2×1 = 12+4+8+2 = 26
 */
import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { AvatarProvider } from "./avatar-provider.interface";

const logger = pino({ level: "info" });

@Injectable()
export class AvatarProviderRegistry {
  private readonly providers: AvatarProvider[] = [];

  register(provider: AvatarProvider): void {
    this.providers.push(provider);
    logger.info({ provider: provider.name, scores: provider.scores }, "Avatar provider registered");
  }

  async generate(params: {
    audioUrl: string;
    imageUrl: string;
    sceneId: string;
    preferredProvider?: AvatarProvider["name"];
    avatarId?: string;
  }): Promise<{ s3Url: string; provider: AvatarProvider["name"] }> {
    const ranked = await this.rankAvailableProviders(params.preferredProvider);

    if (ranked.length === 0) {
      throw new Error(
        "No avatar providers available. " +
        "Configure a HeyGen or D-ID API key in Settings, " +
        "or start the ai-backend service for local Wav2Lip.",
      );
    }

    let lastError: Error | null = null;

    for (let i = 0; i < ranked.length; i++) {
      const provider = ranked[i];

      if (i > 0 && lastError) {
        logger.warn(
          { from: ranked[i - 1].name, to: provider.name, reason: lastError.message },
          "Falling back to next avatar provider",
        );
      }

      try {
        const s3Url = await provider.generate(params);
        return { s3Url, provider: provider.name };
      } catch (err: any) {
        lastError = err;
        logger.error({ provider: provider.name, error: err.message }, "Avatar provider failed");
      }
    }

    throw new Error(
      `All avatar providers failed. Last error: ${lastError?.message ?? "unknown"}. ` +
      `Tried: ${ranked.map((p) => p.name).join(", ")}`,
    );
  }

  async getProviderStatus(): Promise<Array<{ name: string; available: boolean; score: number }>> {
    return Promise.all(
      this.providers.map(async (p) => ({
        name: p.name,
        available: await p.isAvailable().catch(() => false),
        score: this.composite(p.scores),
      })),
    );
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async rankAvailableProviders(preferred?: string): Promise<AvatarProvider[]> {
    const available: AvatarProvider[] = [];
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) available.push(provider);
      } catch {
        // treat as unavailable
      }
    }

    return available.sort((a, b) => {
      // Preferred provider always goes first
      if (preferred) {
        if (a.name === preferred) return -1;
        if (b.name === preferred) return 1;
      }
      return this.composite(b.scores) - this.composite(a.scores);
    });
  }

  private composite(scores: AvatarProvider["scores"]): number {
    return scores.quality * 3 + scores.cost * 2 + scores.reliability * 2 + scores.latency * 1;
  }
}
