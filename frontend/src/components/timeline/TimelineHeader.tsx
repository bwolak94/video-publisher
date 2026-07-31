"use client";
import React, { useMemo } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import { RegenerateAllButton } from "./RegenerateAllButton";
import { GenerateAllButton } from "./GenerateAllButton";
import { CostBreakdown } from "./CostBreakdown";
import { LocalizeButton } from "./LocalizeButton";

interface TimelineHeaderProps {
  onRender?: () => void;
  budgetExceeded?: boolean;
  projectId?: string;
}

export function TimelineHeader({ onRender, budgetExceeded = false, projectId }: TimelineHeaderProps) {
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
      className="flex items-center justify-between px-5 h-14 border-b border-line bg-panel flex-shrink-0"
      data-testid="timeline-header"
    >
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-ink">Timeline Editor</h2>
        <span className="text-xs text-ink-muted" data-testid="scene-count">
          {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
        </span>
        <span className="text-xs text-ink-muted tabular-nums" data-testid="total-duration">
          {formattedDuration}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <CostBreakdown budgetExceeded={budgetExceeded} />
        {projectId && <LocalizeButton projectId={projectId} />}
        <GenerateAllButton projectId={projectId} />
        <RegenerateAllButton budgetExceeded={budgetExceeded} />
        <button
          onClick={onRender}
          disabled={sceneCount === 0}
          data-testid="render-button"
          className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity active:scale-95"
          style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
        >
          Render Video
        </button>
      </div>
    </div>
  );
}
