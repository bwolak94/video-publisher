import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { VideoStoryboard } from "../storyboard/video-storyboard";
import { NarrationScene } from "./scenes/NarrationScene";
import { ImageScene } from "./scenes/ImageScene";
import { FPS, DEFAULT_SCENE_DURATION_SECONDS } from "./render-utils";

interface VideoStoryboardCompositionProps {
  storyboard: VideoStoryboard;
}

export const VideoStoryboardComposition: React.FC<VideoStoryboardCompositionProps> = ({
  storyboard,
}) => {
  let startFrame = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {storyboard.timeline.map((scene) => {
        const durationInFrames =
          (scene.durationInSeconds ?? DEFAULT_SCENE_DURATION_SECONDS) * FPS;
        const from = startFrame;
        startFrame += durationInFrames;

        // Image scenes use static image backgrounds (DALL-E / Stable Diffusion)
        const isImageScene = scene.videoUrl?.includes("/images/");

        return (
          <Sequence key={scene.sceneId} from={from} durationInFrames={durationInFrames}>
            {isImageScene ? (
              <ImageScene
                audioUrl={scene.audioUrl}
                videoUrl={scene.videoUrl}
                narrationText={scene.narrationText}
                textOverlay={scene.textOverlay}
              />
            ) : (
              <NarrationScene
                audioUrl={scene.audioUrl}
                videoUrl={scene.videoUrl}
                narrationText={scene.narrationText}
                textOverlay={scene.textOverlay}
              />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
