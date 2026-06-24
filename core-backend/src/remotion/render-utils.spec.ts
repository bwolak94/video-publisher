/**
 * Unit tests for render utilities — UT-14-01..03
 */
import {
  calculateDurationInFrames,
  getCompositionWidth,
  getCompositionHeight,
  FPS,
} from "./render-utils";

describe("render-utils", () => {
  // UT-14-01
  it("calculateDurationInFrames: 3 scenes (5s, 10s, 15s) at fps=30 → 900 frames", () => {
    const scenes = [
      { durationInSeconds: 5 },
      { durationInSeconds: 10 },
      { durationInSeconds: 15 },
    ];
    expect(calculateDurationInFrames(scenes, 30)).toBe(900);
  });

  it("calculateDurationInFrames: defaults to 5s per scene when durationInSeconds missing", () => {
    const scenes = [{ durationInSeconds: undefined }, { durationInSeconds: undefined }];
    expect(calculateDurationInFrames(scenes as any, 30)).toBe(300);
  });

  // UT-14-02
  it("getCompositionWidth: 9:16 → 1080", () => {
    expect(getCompositionWidth("9:16")).toBe(1080);
  });

  // UT-14-03
  it("getCompositionWidth: 16:9 → 1920", () => {
    expect(getCompositionWidth("16:9")).toBe(1920);
  });

  it("getCompositionHeight: 9:16 → 1920", () => {
    expect(getCompositionHeight("9:16")).toBe(1920);
  });

  it("getCompositionHeight: 16:9 → 1080", () => {
    expect(getCompositionHeight("16:9")).toBe(1080);
  });
});
