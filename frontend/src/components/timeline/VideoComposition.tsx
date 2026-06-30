"use client";
import React from "react";
import { AbsoluteFill, Audio, Sequence, Video } from "remotion";
import type { SceneState } from "@/store/timelineStore";
import type { MusicTrack } from "@/types/music";
import { SubtitleOverlay } from "./SubtitleOverlay";

const FPS = 30;

interface VideoCompositionProps {
  scenes: Pick<
    SceneState,
    "sceneId" | "videoUrl" | "audioUrl" | "durationInSeconds" | "subtitleTrack"
  >[];
  musicTrack?: MusicTrack | null;
  musicVolume?: number;
}

export function VideoComposition({ scenes, musicTrack, musicVolume = 0.3 }: VideoCompositionProps) {
  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Project-level background music — plays across all scenes (FEATURE-03) */}
      {musicTrack?.s3Url && (
        <Audio src={musicTrack.s3Url} volume={musicVolume} />
      )}
      {scenes.map((scene) => {
        const durationFrames = Math.max(
          1,
          Math.round((scene.durationInSeconds ?? 5) * FPS)
        );
        const from = frameOffset;
        frameOffset += durationFrames;

        return (
          <Sequence key={scene.sceneId} from={from} durationInFrames={durationFrames}>
            <AbsoluteFill>
              {scene.videoUrl ? (
                <Video
                  src={scene.videoUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  className="w-full h-full bg-gray-700 flex items-center justify-center"
                  data-testid={`scene-placeholder-${scene.sceneId}`}
                >
                  <span className="text-white text-sm">Asset pending</span>
                </div>
              )}
              {scene.audioUrl && <Audio src={scene.audioUrl} />}
              {scene.subtitleTrack && scene.subtitleTrack.words.length > 0 && (
                <SubtitleOverlay words={scene.subtitleTrack.words} fps={FPS} />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
