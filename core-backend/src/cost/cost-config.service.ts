import { Injectable } from "@nestjs/common";

export interface CostConfig {
  elevenlabsPerCharUsd: number;    // default: 0.0003
  runwayPerSceneUsd: number;       // default: 0.15
  pexelsPerSceneUsd: number;       // default: 0.00
  dalle3PerImageUsd: number;       // default: 0.04
  lambdaRenderPerMinUsd: number;   // default: 0.001
}

@Injectable()
export class CostConfigService {
  get(): CostConfig {
    return {
      elevenlabsPerCharUsd: parseFloat(process.env.COST_ELEVENLABS_PER_CHAR ?? "0.0003"),
      runwayPerSceneUsd: parseFloat(process.env.COST_RUNWAY_PER_SCENE ?? "0.15"),
      pexelsPerSceneUsd: parseFloat(process.env.COST_PEXELS_PER_SCENE ?? "0"),
      dalle3PerImageUsd: parseFloat(process.env.COST_DALLE3_PER_IMAGE ?? "0.04"),
      lambdaRenderPerMinUsd: parseFloat(process.env.COST_LAMBDA_PER_MIN ?? "0.001"),
    };
  }
}
