"use client";
import React, { useMemo } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import { estimateBreakdown, formatCost } from "@/lib/cost-estimation";

interface CostBreakdownProps {
  /** When true the "Generate Assets" button is disabled and a hard-stop message shown. */
  budgetExceeded?: boolean;
}

export function CostBreakdown({ budgetExceeded = false }: CostBreakdownProps) {
  const scenes = useTimelineStore((s) => s.scenes);
  const sceneOrder = useTimelineStore((s) => s.sceneOrder);

  const breakdown = useMemo(() => {
    const dirtyScenes = sceneOrder
      .map((id) => scenes[id])
      .filter((s) => s?.isDirty)
      .map((s) => ({
        narrationDirty: s.narrationDirty,
        visualDirty: s.visualDirty,
        durationInSeconds: s.durationInSeconds,
      }));
    return estimateBreakdown(dirtyScenes);
  }, [scenes, sceneOrder]);

  const hasDirtyScenes = breakdown.total > 0;

  if (!hasDirtyScenes) return null;

  return (
    <div
      className={`text-xs rounded-md px-3 py-2 border ${
        budgetExceeded
          ? "bg-red-50 border-red-200 text-red-700"
          : "bg-gray-50 border-gray-200 text-gray-600"
      }`}
      data-testid="cost-breakdown"
    >
      <p className="font-medium mb-1">
        {budgetExceeded ? "Budget exceeded" : "Estimated cost (approximate)"}
      </p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-6" data-testid="cost-line-audio">
          <span>Audio (ElevenLabs)</span>
          <span>{formatCost(breakdown.audioTotal)}</span>
        </div>
        <div className="flex justify-between gap-6" data-testid="cost-line-video">
          <span>Video (Runway)</span>
          <span>{formatCost(breakdown.videoTotal)}</span>
        </div>
        <div className="flex justify-between gap-6" data-testid="cost-line-render">
          <span>Render (Lambda)</span>
          <span>{formatCost(breakdown.renderTotal)}</span>
        </div>
        <div
          className="flex justify-between gap-6 font-semibold border-t border-gray-200 mt-1 pt-1"
          data-testid="cost-total"
        >
          <span>Total</span>
          <span>~{formatCost(breakdown.total)}</span>
        </div>
      </div>
    </div>
  );
}
