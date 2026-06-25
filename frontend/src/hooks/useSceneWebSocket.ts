"use client";
import { useEffect } from "react";
import { useTimelineStore } from "@/store/timelineStore";

interface StepCompletedEvent {
  type: "step_completed";
  sceneId: string;
  audioUrl?: string;
  videoUrl?: string;
}

interface StepFailedEvent {
  type: "step_failed";
  sceneId: string;
}

type WsEvent = StepCompletedEvent | StepFailedEvent;

const DEFAULT_WS_URL = "ws://localhost:3001";

/**
 * Connects to the backend WebSocket and handles scene regeneration progress events.
 *
 * step_completed → markSceneClean (or updateSceneUrls if new URLs provided)
 * step_failed    → markSceneStatus("error") — isDirty intentionally stays true
 */
export function useSceneWebSocket(projectId: string | null): void {
  useEffect(() => {
    if (!projectId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL;
    const ws = new WebSocket(`${wsUrl}/ws`);

    ws.onmessage = (event: MessageEvent) => {
      let data: WsEvent;
      try {
        data = JSON.parse(event.data as string) as WsEvent;
      } catch {
        return; // ignore malformed messages
      }

      const store = useTimelineStore.getState();

      if (data.type === "step_completed") {
        if (data.audioUrl || data.videoUrl) {
          const current = store.scenes[data.sceneId];
          store.updateSceneUrls(
            data.sceneId,
            data.audioUrl ?? current?.audioUrl ?? "",
            data.videoUrl ?? current?.videoUrl ?? ""
          );
        } else {
          store.markSceneClean(data.sceneId);
        }
      } else if (data.type === "step_failed") {
        // isDirty remains true — failure does not clear dirty flag (Rule 2)
        store.markSceneStatus(data.sceneId, "error");
      }
    };

    return () => {
      ws.close();
    };
  }, [projectId]);
}
