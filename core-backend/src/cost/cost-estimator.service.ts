import { Injectable } from "@nestjs/common";
import { CostConfigService, type CostConfig } from "./cost-config.service";

export interface SceneSummary {
  narrationText: string;
  durationInSeconds?: number;
  assetType?: "video" | "image";
  /**
   * I6: Expected video provider for this scene.
   * If omitted the estimate defaults to runway (most common paid provider).
   * Pass "pexels" or "archival" for scenes where free footage will be used.
   */
  videoProvider?: string;
}

export interface CostBreakdown {
  audioTotal: number;
  videoTotal: number;
  imageTotal: number;
  renderTotal: number;
  total: number;
}

@Injectable()
export class CostEstimatorService {
  constructor(private readonly costConfig: CostConfigService) {}

  estimate(scenes: SceneSummary[]): CostBreakdown {
    const config = this.costConfig.get();
    return CostEstimatorService.estimateWithConfig(scenes, config);
  }

  /** Pure calculation — usable without DI for tests. */
  static estimateWithConfig(scenes: SceneSummary[], config: CostConfig): CostBreakdown {
    if (scenes.length === 0) {
      return { audioTotal: 0, videoTotal: 0, imageTotal: 0, renderTotal: 0, total: 0 };
    }

    const audioTotal = scenes.reduce(
      (acc, s) => acc + s.narrationText.length * config.elevenlabsPerCharUsd,
      0
    );

    const imageScenes = scenes.filter((s) => s.assetType === "image");
    const videoScenes = scenes.filter((s) => s.assetType !== "image");

    const imageTotal = imageScenes.length * config.dalle3PerImageUsd;

    // I6: Look up provider-specific rate for each video scene instead of
    // assuming all scenes use Runway. Free providers (pexels, archival) cost $0.
    const videoTotal = videoScenes.reduce((acc, s) => {
      return acc + CostEstimatorService.videoSceneCost(s.videoProvider, config);
    }, 0);

    const totalDurationSeconds = scenes.reduce(
      (acc, s) => acc + (s.durationInSeconds ?? 5),
      0
    );
    const renderTotal = (totalDurationSeconds / 60) * config.lambdaRenderPerMinUsd;

    const total = audioTotal + videoTotal + imageTotal + renderTotal;
    return { audioTotal, videoTotal, imageTotal, renderTotal, total };
  }

  /** Returns the per-scene USD cost for the given provider name. */
  static videoSceneCost(provider: string | undefined, config: CostConfig): number {
    switch (provider) {
      case "pexels":   return config.pexelsPerSceneUsd;
      case "archival": return config.archivalPerSceneUsd;
      case "kling":    return config.klingPerSceneUsd;
      case "veo":      return config.veoPerSceneUsd;
      default:         return config.runwayPerSceneUsd; // runway or unknown
    }
  }
}
