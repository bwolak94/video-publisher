import { Injectable } from "@nestjs/common";
import { PexelsService } from "./pexels.service";
import { SettingsService } from "../settings/settings.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";

/**
 * Adapter: wraps PexelsService to implement VideoProvider interface.
 */
@Injectable()
export class PexelsProvider implements VideoProvider {
  readonly name = "pexels";

  readonly scores: ProviderScores = {
    quality: 3,
    cost: 4,       // free tier, generous limits
    reliability: 5,
    latency: 5,    // instant — just a search + download
  };

  constructor(
    private readonly pexels: PexelsService,
    private readonly settings: SettingsService,
  ) {}

  async isAvailable(): Promise<boolean> {
    if (process.env.PEXELS_API_KEY) return true;
    const key = await this.settings.getPlaintext("integrations.pexelsKey");
    return !!(key && key.length > 0);
  }

  async generate(params: VideoGenerateParams): Promise<string> {
    return this.pexels.searchAndDownload(params.visualPrompt, params.aspectRatio ?? "16:9");
  }
}
