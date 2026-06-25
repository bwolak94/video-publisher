"use client";
import { useCallback, useEffect, useRef } from "react";
import { useTimelineStore } from "@/store/timelineStore";

const DEBOUNCE_MS = 500;

/**
 * Returns a stable callback that, when invoked, debounces a PATCH request to
 * persist the current scene order to the backend. Rapid successive reorders
 * collapse into a single request (Rule 4 / UC-04).
 */
export function useReorderDebounce(projectId: string | undefined): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!projectId) return;
      const { scenes, sceneOrder } = useTimelineStore.getState();
      const payload = sceneOrder.map((id) => ({
        sceneId: id,
        sequenceNumber: scenes[id].sequenceNumber,
      }));
      fetch(`/api/projects/${projectId}/storyboard`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneOrder: payload }),
      }).catch(() => {
        console.warn("Failed to persist scene reorder");
      });
    }, DEBOUNCE_MS);
  }, [projectId]);
}
