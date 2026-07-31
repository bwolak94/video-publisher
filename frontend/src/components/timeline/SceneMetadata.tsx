"use client";
import React, { useMemo } from "react";
import { useTimelineStore } from "@/store/timelineStore";

interface SceneMetadataProps {
  sceneId: string;
  durationInSeconds: number;
  isDirty: boolean;
  onClick?: () => void;
}

// sequenceNumber is subscribed internally so SceneCard itself doesn't
// re-render when only sequenceNumber changes after a reorder (TASK-19 Rule 6)
export function SceneMetadata({ sceneId, durationInSeconds, isDirty, onClick }: SceneMetadataProps) {
  const sequenceNumber = useTimelineStore((s) => s.scenes[sceneId]?.sequenceNumber ?? 0);

  const displayDuration = useMemo(() => {
    const s = Math.round(durationInSeconds);
    return `${s}s`;
  }, [durationInSeconds]);

  return (
    <div
      className="flex items-center gap-2 cursor-pointer"
      data-testid="scene-metadata"
      onClick={onClick}
      title="Click to seek preview to this scene"
    >
      <span className="text-xs font-semibold text-ink-secondary">Scene {sequenceNumber}</span>
      <span className="text-xs text-ink-muted tabular-nums">{displayDuration}</span>
      {isDirty && (
        <span className="text-2xs bg-warning-bg text-warning-text border border-warning-border px-1.5 py-0.5 rounded-full">
          unsaved
        </span>
      )}
    </div>
  );
}
