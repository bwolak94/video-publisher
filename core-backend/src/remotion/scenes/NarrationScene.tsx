import React from "react";
import { AbsoluteFill, Audio, Video } from "remotion";
import { TextOverlay } from "../components/TextOverlay";
import { StoryboardScene } from "../../storyboard/video-storyboard";

export interface NarrationSceneProps
  extends Pick<StoryboardScene, "audioUrl" | "videoUrl" | "narrationText" | "textOverlay"> {}

/**
 * Scene component: full-screen video background, narration audio, optional text overlay.
 * All URLs must be HTTPS pre-signed S3 URLs (not s3:// scheme) at render time.
 */
export const NarrationScene: React.FC<NarrationSceneProps> = ({
  audioUrl,
  videoUrl,
  textOverlay,
}) => {
  return (
    <AbsoluteFill>
      {videoUrl && (
        <Video
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
