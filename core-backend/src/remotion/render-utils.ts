import { StoryboardScene } from "../storyboard/video-storyboard";

export const COMPOSITION_ID = "VideoStoryboard";
export const FPS = 30;
export const DEFAULT_SCENE_DURATION_SECONDS = 5;
export const SHORT_FRAMES_PER_LAMBDA = 20; // < 60s
export const LONG_FRAMES_PER_LAMBDA = 40; // >= 60s
export const MEMORY_MB = 3008;
export const LAMBDA_REGION = "eu-central-1";

export function calculateDurationInFrames(
  scenes: Pick<StoryboardScene, "durationInSeconds">[],
  fps: number
): number {
  return scenes.reduce(
    (total, scene) => total + (scene.durationInSeconds ?? DEFAULT_SCENE_DURATION_SECONDS) * fps,
    0
  );
}

export function getCompositionWidth(aspectRatio: "16:9" | "9:16"): number {
  return aspectRatio === "9:16" ? 1080 : 1920;
}

export function getCompositionHeight(aspectRatio: "16:9" | "9:16"): number {
  return aspectRatio === "9:16" ? 1920 : 1080;
}

export function getFramesPerLambda(totalFrames: number, fps: number): number {
  const durationSecs = totalFrames / fps;
  return durationSecs < 60 ? SHORT_FRAMES_PER_LAMBDA : LONG_FRAMES_PER_LAMBDA;
}
