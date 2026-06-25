"use client";
import React, { useCallback, useMemo, useState } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import { estimateCost } from "@/lib/cost-estimation";
import { ConfirmRegenerateModal } from "./ConfirmRegenerateModal";

const COST_WARNING_THRESHOLD = 5;

interface RegenerateAllButtonProps {
  budgetExceeded?: boolean;
}

export function RegenerateAllButton({ budgetExceeded = false }: RegenerateAllButtonProps) {
  const [showModal, setShowModal] = useState(false);

  // Subscribe only to the minimal slice needed for the button label
  const dirtyCount = useTimelineStore((s) =>
    s.sceneOrder.filter((id) => s.scenes[id]?.isDirty).length
  );

  const estimatedCost = useTimelineStore((s) => {
    const dirtyScenesData = s.sceneOrder
      .filter((id) => s.scenes[id]?.isDirty)
      .map((id) => s.scenes[id]);
    return estimateCost(dirtyScenesData);
  });

  // Dispatch reads from store at call-time — no stale closures
  const dispatchRegeneration = useCallback(() => {
    const { scenes, sceneOrder, markSceneStatus } = useTimelineStore.getState();
    sceneOrder
      .filter((id) => scenes[id]?.isDirty)
      .forEach((sceneId) => {
        markSceneStatus(sceneId, "regenerating");
        fetch(`/api/scenes/${sceneId}/regenerate`, { method: "POST" }).catch(() => {
          useTimelineStore.getState().markSceneStatus(sceneId, "error");
        });
      });
  }, []);

  const handleClick = useCallback(() => {
    if (dirtyCount === 0) return;
    if (dirtyCount > COST_WARNING_THRESHOLD) {
      setShowModal(true);
    } else {
      dispatchRegeneration();
    }
  }, [dirtyCount, dispatchRegeneration]);

  const handleConfirm = useCallback(() => {
    setShowModal(false);
    dispatchRegeneration();
  }, [dispatchRegeneration]);

  const handleCancel = useCallback(() => {
    setShowModal(false);
  }, []);

  return (
    <>
      <button
        onClick={handleClick}
        disabled={dirtyCount === 0 || budgetExceeded}
        data-testid="regenerate-all-btn"
        className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-40"
      >
        Regenerate All{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
      </button>
      {showModal && (
        <ConfirmRegenerateModal
          dirtyCount={dirtyCount}
          estimatedCost={estimatedCost}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
