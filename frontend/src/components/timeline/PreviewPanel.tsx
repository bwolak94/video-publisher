"use client";
import React, { useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { PlayerRef } from "@remotion/player";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { calculateStartFrame, calculateTotalFrames } from "@/lib/remotion-utils";
import { VideoComposition } from "./VideoComposition";

// Prevent Remotion from running server-side (Rule 6: uses browser APIs)
const Player = dynamic(
  () => import("@remotion/player").then((m) => m.Player),
  { ssr: false }
);

const FPS = 30;

interface PreviewPanelProps {
  onSeekReady?: (seekFn: (sceneId: string) => void) => void;
  /** Optional ref injection for testing — allows test to assert on seekTo calls */
  playerRef?: React.RefObject<PlayerRef | null>;
}

export function PreviewPanel({ onSeekReady, playerRef: externalRef }: PreviewPanelProps) {
  const internalRef = useRef<PlayerRef>(null);
  const activeRef = (externalRef ?? internalRef) as React.RefObject<PlayerRef | null>;

  const sceneOrder = useTimelineStore((s) => s.sceneOrder);
  const scenesMap  = useTimelineStore((s) => s.scenes);
  const scenes     = sceneOrder.map((id) => scenesMap[id]).filter(Boolean);

  const musicTrack  = useProjectStore((s) => s.musicTrack);
  const musicVolume = useProjectStore((s) => s.musicVolume);

  const debouncedScenes = useDebouncedValue(scenes, 150);
  const totalFrames = calculateTotalFrames(debouncedScenes, FPS);

  const seekToScene = useCallback(
    (sceneId: string) => {
      const idx = debouncedScenes.findIndex((s) => s.sceneId === sceneId);
      if (idx === -1 || !activeRef.current) return;
      const frame = calculateStartFrame(debouncedScenes, idx, FPS);
      activeRef.current.seekTo(frame);
    },
    [debouncedScenes, activeRef]
  );

  useEffect(() => {
    onSeekReady?.(seekToScene);
  }, [onSeekReady, seekToScene]);

  return (
    <div className="w-full h-full bg-black" data-testid="preview-panel">
      <Player
        ref={activeRef as React.RefObject<PlayerRef>}
        component={VideoComposition}
        inputProps={{ scenes: debouncedScenes, musicTrack, musicVolume }}
        durationInFrames={Math.max(1, totalFrames)}
        compositionWidth={1920}
        compositionHeight={1080}
        fps={FPS}
        style={{ width: "100%", height: "100%" }}
        controls
      />
    </div>
  );
}
