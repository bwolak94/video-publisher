import { Injectable } from "@nestjs/common";
import { RunwayService } from "./runway.service";
import { SettingsService } from "../settings/settings.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";

/**
 * Adapter: wraps RunwayService to implement VideoProvider interface.
 */
@Injectable()
export class RunwayProvider implements VideoProvider {
  readonly name = "runway";

  readonly scores: ProviderScores = {
    quality: 5,
    cost: 1,       // most expensive
    reliability: 4,
    latency: 2,    // ~90s average
  };

  constructor(
    private readonly runway: RunwayService,
    private readonly settings: SettingsService,
  ) {}

  async isAvailable(): Promise<boolean> {
    if (process.env.RUNWAY_API_KEY) return true;
    const key = await this.settings.getPlaintext("integrations.runwayKey");
    return !!(key && key.length > 0);
  }

  async generate(params: VideoGenerateParams): Promise<string> {
    return this.runway.generateVideo({ visualPrompt: params.visualPrompt });
  }
}
