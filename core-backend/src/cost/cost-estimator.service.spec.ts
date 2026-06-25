import { CostEstimatorService, type SceneSummary } from "./cost-estimator.service";
import type { CostConfig } from "./cost-config.service";

const DEFAULT_CONFIG: CostConfig = {
  elevenlabsPerCharUsd: 0.0003,
  runwayPerSceneUsd: 0.15,
  pexelsPerSceneUsd: 0,
  dalle3PerImageUsd: 0.04,
  lambdaRenderPerMinUsd: 0.001,
};

function makeScene(overrides: Partial<SceneSummary> = {}): SceneSummary {
  return {
    narrationText: "Hello world this is a narration text.", // 37 chars
    durationInSeconds: 5,
    assetType: "video",
    ...overrides,
  };
}

describe("CostEstimatorService", () => {
  // UT-25-01: 6 video scenes, 6 audio scenes (all video type with narration)
  it("estimates cost correctly for 6 scenes", () => {
    const scenes = Array.from({ length: 6 }, () => makeScene());
    const result = CostEstimatorService.estimateWithConfig(scenes, DEFAULT_CONFIG);

    const expectedAudio = 6 * 37 * 0.0003; // 6 scenes × 37 chars × $0.0003
    const expectedVideo = 6 * 0.15;
    const expectedRender = (6 * 5 / 60) * 0.001; // 30 seconds / 60 * $0.001

    expect(result.audioTotal).toBeCloseTo(expectedAudio, 6);
    expect(result.videoTotal).toBeCloseTo(expectedVideo, 6);
    expect(result.imageTotal).toBe(0);
    expect(result.renderTotal).toBeCloseTo(expectedRender, 6);
    expect(result.total).toBeCloseTo(expectedAudio + expectedVideo + expectedRender, 6);
  });

  // UT-25-02: 0 scenes → total: 0
  it("returns all zeros for empty scene list", () => {
    const result = CostEstimatorService.estimateWithConfig([], DEFAULT_CONFIG);
    expect(result).toEqual({ audioTotal: 0, videoTotal: 0, imageTotal: 0, renderTotal: 0, total: 0 });
  });

  it("uses dalle3 cost for image scenes, runway for video scenes", () => {
    const scenes = [
      makeScene({ assetType: "video" }),
      makeScene({ assetType: "image" }),
    ];
    const result = CostEstimatorService.estimateWithConfig(scenes, DEFAULT_CONFIG);
    expect(result.videoTotal).toBeCloseTo(0.15, 6);
    expect(result.imageTotal).toBeCloseTo(0.04, 6);
  });
});
