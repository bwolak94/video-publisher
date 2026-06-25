"use client";
import React, { useMemo } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import { RegenerateAllButton } from "./RegenerateAllButton";
import { CostBreakdown } from "./CostBreakdown";

interface TimelineHeaderProps {
  onRender?: () => void;
  budgetExceeded?: boolean;
}

export function TimelineHeader({ onRender, budgetExceeded = false }: TimelineHeaderProps) {
  const scenes = useTimelineStore((s) => s.scenes);
  const sceneOrder = useTimelineStore((s) => s.sceneOrder);

  const { totalDuration, sceneCount } = useMemo(() => {
    const totalDuration = sceneOrder.reduce(
      (sum, id) => sum + (scenes[id]?.durationInSeconds ?? 0),
      0
    );
    return { totalDuration, sceneCount: sceneOrder.length };
  }, [scenes, sceneOrder]);

  const formattedDuration = useMemo(() => {
    const m = Math.floor(totalDuration / 60);
    const s = Math.floor(totalDuration % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [totalDuration]);

  return (
    <div
      className="flex items-center justify-between px-6 py-3 border-b bg-white"
      data-testid="timeline-header"
    >
      <div className="flex items-center gap-4">
        <h2 className="font-semibold text-gray-900">Timeline Editor</h2>
        <span className="text-sm text-gray-500" data-testid="scene-count">
          {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
        </span>
        <span className="text-sm text-gray-500" data-testid="total-duration">
          {formattedDuration}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <CostBreakdown budgetExceeded={budgetExceeded} />
        <RegenerateAllButton budgetExceeded={budgetExceeded} />
        <button
          onClick={onRender}
          disabled={sceneCount === 0}
          data-testid="render-button"
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          Render Video
        </button>
      </div>
    </div>
  );
}
