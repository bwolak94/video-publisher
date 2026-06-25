import type { VideoStoryboardScene } from "@/types/storyboard";

/**
 * Calculates the start frame of a scene at the given index.
 * Sums durationInSeconds of all preceding scenes × fps.
 */
export function calculateStartFrame(
  scenes: Pick<VideoStoryboardScene, "durationInSeconds">[],
  sceneIndex: number,
  fps: number
): number {
  return Math.round(
    scenes
      .slice(0, sceneIndex)
      .reduce((acc, s) => acc + (s.durationInSeconds ?? 0) * fps, 0)
  );
}

/**
 * Calculates the total number of frames for all scenes combined.
 */
export function calculateTotalFrames(
  scenes: Pick<VideoStoryboardScene, "durationInSeconds">[],
  fps: number
): number {
  return Math.round(
    scenes.reduce((acc, s) => acc + (s.durationInSeconds ?? 0) * fps, 0)
  );
}
