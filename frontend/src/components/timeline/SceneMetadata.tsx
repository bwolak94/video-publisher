"use client";
import React, { useMemo } from "react";

interface SceneMetadataProps {
  sequenceNumber: number;
  durationInSeconds: number;
  isDirty: boolean;
}

export function SceneMetadata({ sequenceNumber, durationInSeconds, isDirty }: SceneMetadataProps) {
  const displayDuration = useMemo(() => {
    const s = Math.round(durationInSeconds);
    return `${s}s`;
  }, [durationInSeconds]);

  return (
    <div className="flex items-center gap-2" data-testid="scene-metadata">
      <span className="text-xs font-medium text-gray-500">Scene {sequenceNumber}</span>
      <span className="text-xs text-gray-400">{displayDuration}</span>
      {isDirty && (
        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
          unsaved
        </span>
      )}
    </div>
  );
}
