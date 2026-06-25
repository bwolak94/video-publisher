/**
 * Unit tests for Remotion preview utilities — UT-20-01..03
 */
import { calculateStartFrame, calculateTotalFrames } from "@/lib/remotion-utils";
import type { VideoStoryboardScene } from "@/types/storyboard";

const makeScene = (
  id: string,
  duration: number
): Pick<VideoStoryboardScene, "sceneId" | "durationInSeconds"> => ({
  sceneId: id,
  durationInSeconds: duration,
});

// UT-20-01: calculateStartFrame for index 2 in [5s, 5s, 10s] = 10s × 30fps = 300
it("calculateStartFrame returns 300 for sceneIndex=2 in [5, 5, 10] at 30fps (UT-20-01)", () => {
  const scenes = [makeScene("s1", 5), makeScene("s2", 5), makeScene("s3", 10)];
  expect(calculateStartFrame(scenes, 2, 30)).toBe(300);
});

// UT-20-02: calculateStartFrame for first scene always returns 0
it("calculateStartFrame returns 0 for first scene (UT-20-02)", () => {
  const scenes = [makeScene("s1", 5), makeScene("s2", 5)];
  expect(calculateStartFrame(scenes, 0, 30)).toBe(0);
});

// UT-20-03: calculateTotalFrames for [5s, 5s, 10s] at 30fps = 600
it("calculateTotalFrames returns 600 for [5, 5, 10] at 30fps (UT-20-03)", () => {
  const scenes = [makeScene("s1", 5), makeScene("s2", 5), makeScene("s3", 10)];
  expect(calculateTotalFrames(scenes, 30)).toBe(600);
});
