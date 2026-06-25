import { Injectable } from "@nestjs/common";
import { CostConfigService, type CostConfig } from "./cost-config.service";

export interface SceneSummary {
  narrationText: string;
  durationInSeconds?: number;
  assetType?: "video" | "image";
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

    const videoScenes = scenes.filter((s) => s.assetType !== "image").length;
    const imageScenes = scenes.filter((s) => s.assetType === "image").length;

    const videoTotal = videoScenes * config.runwayPerSceneUsd;
    const imageTotal = imageScenes * config.dalle3PerImageUsd;

    const totalDurationSeconds = scenes.reduce(
      (acc, s) => acc + (s.durationInSeconds ?? 5),
      0
    );
    const renderTotal = (totalDurationSeconds / 60) * config.lambdaRenderPerMinUsd;

    const total = audioTotal + videoTotal + imageTotal + renderTotal;
    return { audioTotal, videoTotal, imageTotal, renderTotal, total };
  }
}
