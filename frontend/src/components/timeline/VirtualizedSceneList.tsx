"use client";
import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTimelineStore } from "@/store/timelineStore";
import { SceneCard } from "./SceneCard";

const ESTIMATED_SCENE_HEIGHT = 220;
const OVERSCAN = 5;

export function VirtualizedSceneList() {
  const sceneOrder = useTimelineStore((s) => s.sceneOrder);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sceneOrder.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_SCENE_HEIGHT,
    overscan: OVERSCAN,
  });

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto px-4 py-2"
      data-testid="virtualized-scene-list"
      style={{ height: "100%" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
              paddingBottom: "12px",
            }}
          >
            <SceneCard sceneId={sceneOrder[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
