import React from "react";
import { AbsoluteFill, Audio, Img } from "remotion";
import { TextOverlay } from "../components/TextOverlay";
import { StoryboardScene } from "../../storyboard/video-storyboard";

export interface ImageSceneProps
  extends Pick<StoryboardScene, "audioUrl" | "videoUrl" | "narrationText" | "textOverlay"> {}

/**
 * Scene component: static image background, narration audio, optional text overlay.
 * videoUrl field carries the image URL for image-type scenes (DALL-E / Stable Diffusion output).
 */
export const ImageScene: React.FC<ImageSceneProps> = ({
  audioUrl,
  videoUrl,
  textOverlay,
}) => {
  return (
    <AbsoluteFill>
      {videoUrl && (
        <Img
          src={videoUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {audioUrl && <Audio src={audioUrl} />}
      {textOverlay && (
        <TextOverlay
          text={textOverlay.text}
          style={textOverlay.style}
          position={textOverlay.position}
        />
      )}
    </AbsoluteFill>
  );
};
