"use client";
import { useEffect, useRef } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import { saveDraft, serializeScene } from "@/lib/storyboardStorage";

const DEBOUNCE_MS = 1000;

/**
 * Subscribes to the timeline store and auto-saves a debounced draft on every change.
 * Writes at most once per second per Rule 1 of TASK-21.
 * No-op when projectId is undefined.
 */
export function usePersistTimeline(projectId: string | undefined): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = useTimelineStore.subscribe((state) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const { sceneOrder, scenes } = state;
        const sceneList = sceneOrder
          .map((id) => scenes[id])
          .filter(Boolean)
          .map(serializeScene);

        saveDraft({
          projectId: projectId,
          savedAt: Date.now(),
          scenes: sceneList,
        }).catch((err) => console.warn("Failed to persist draft:", err));
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId]);
}
