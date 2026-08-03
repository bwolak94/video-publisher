"use client";
import React from "react";
import { AbsoluteFill, Audio, Video, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { filmBurn } from "@remotion/transitions/film-burn";
import type { SceneState } from "@/store/timelineStore";
import type { MusicTrack } from "@/types/music";
import { SubtitleOverlay } from "./SubtitleOverlay";
import { s3ToHttpUrl } from "@/lib/s3url";

const FPS = 30;
const TRANSITION_FRAMES = 15;

type TransitionType = NonNullable<SceneState["transitionType"]>;

interface VideoCompositionProps {
  scenes: Pick<
    SceneState,
    "sceneId" | "videoUrl" | "audioUrl" | "durationInSeconds" | "subtitleTrack" | "transitionType"
  >[];
  musicTrack?: MusicTrack | null;
  musicVolume?: number;
}

/** Ken Burns zoom-in + subtle pan — no transition logic here (handled by TransitionSeries). */
function SceneClip({
  scene,
  durationFrames,
  index,
}: {
  scene: Pick<SceneState, "sceneId" | "videoUrl" | "audioUrl" | "subtitleTrack">;
  durationFrames: number;
  index: number;
}) {
  const frame = useCurrentFrame();
  const panRight = index % 2 === 0;

  const scale = interpolate(frame, [0, durationFrames], [1.0, 1.07], { extrapolateRight: "clamp" });
  const translateX = interpolate(frame, [0, durationFrames], [0, panRight ? -2 : 2], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translateX(${translateX}%)`,
          transformOrigin: "center center",
        }}
      >
        {scene.videoUrl ? (
          <Video
            src={s3ToHttpUrl(scene.videoUrl) ?? scene.videoUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            className="w-full h-full bg-gray-800 flex items-center justify-center"
            data-testid={`scene-placeholder-${scene.sceneId}`}
          >
            <span className="text-white text-sm">Asset pending</span>
          </div>
        )}
      </AbsoluteFill>
      {scene.audioUrl && <Audio src={s3ToHttpUrl(scene.audioUrl) ?? scene.audioUrl} />}
      {scene.subtitleTrack && scene.subtitleTrack.words.length > 0 && (
        <SubtitleOverlay words={scene.subtitleTrack.words} fps={FPS} />
      )}
    </AbsoluteFill>
  );
}

export function VideoComposition({ scenes, musicTrack, musicVolume = 0.3 }: VideoCompositionProps) {
  const { width, height } = useVideoConfig();

  function getPresentation(type: TransitionType) {
    switch (type) {
      case "slide":      return slide();
      case "wipe":       return wipe();
      case "flip":       return flip();
      case "clock-wipe": return clockWipe({ width, height });
      case "film-burn":  return filmBurn({});
      case "fade":
      default:           return fade();
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {musicTrack?.s3Url && (
        <Audio src={s3ToHttpUrl(musicTrack.s3Url) ?? musicTrack.s3Url} volume={musicVolume} />
      )}
      <TransitionSeries>
        {scenes.map((scene, index) => {
          const durationFrames = Math.max(1, Math.round((scene.durationInSeconds ?? 5) * FPS));
          const transType: TransitionType = scene.transitionType ?? "fade";

          return (
            <React.Fragment key={scene.sceneId}>
              {index > 0 && transType !== "none" && (
                <TransitionSeries.Transition
                  presentation={getPresentation(transType) as ReturnType<typeof fade>}
                  timing={springTiming({ durationInFrames: TRANSITION_FRAMES, config: { damping: 200 } })}
                />
              )}
              <TransitionSeries.Sequence durationInFrames={durationFrames}>
                <SceneClip scene={scene} durationFrames={durationFrames} index={index} />
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
}
