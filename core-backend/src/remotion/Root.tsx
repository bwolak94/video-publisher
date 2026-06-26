import React from "react";
import { Composition, registerRoot } from "remotion";
import { VideoStoryboardComposition } from "./VideoStoryboard";
import {
  COMPOSITION_ID,
  FPS,
  calculateDurationInFrames,
  getCompositionWidth,
  getCompositionHeight,
} from "./render-utils";
import { VideoStoryboard } from "../storyboard/video-storyboard";

// Minimal default storyboard for Remotion Studio preview
const DEFAULT_STORYBOARD: VideoStoryboard = {
  meta: {
    title: "Preview",
    aspectRatio: "9:16",
    language: "en",
    voiceId: "default",
  },
  timeline: [
    {
      sceneId: "preview-scene-1",
      sequenceNumber: 1,
      durationInSeconds: 5,
      narrationText: "Preview scene",
      visualPrompt: "A placeholder scene",
    },
  ],
};

// Fonts: place Inter-Bold.ttf in src/remotion/fonts/ and register here if needed
// loadFont() from @remotion/fonts or use @remotion/google-fonts

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={VideoStoryboardComposition as any}
      fps={FPS}
      width={getCompositionWidth(DEFAULT_STORYBOARD.meta.aspectRatio)}
      height={getCompositionHeight(DEFAULT_STORYBOARD.meta.aspectRatio)}
      durationInFrames={calculateDurationInFrames(DEFAULT_STORYBOARD.timeline, FPS)}
      defaultProps={{ storyboard: DEFAULT_STORYBOARD }}
      calculateMetadata={async ({ props }) => {
        const storyboard = (props as { storyboard: VideoStoryboard }).storyboard;
        return {
          fps: FPS,
          width: getCompositionWidth(storyboard.meta.aspectRatio),
          height: getCompositionHeight(storyboard.meta.aspectRatio),
          durationInFrames: calculateDurationInFrames(storyboard.timeline, FPS),
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
