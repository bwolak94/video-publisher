"use client";
import { useEffect } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import type { ApprovalRequest } from "@/components/timeline/BudgetApprovalModal";

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

interface ApprovalRequiredEvent {
  event: "approval_required";
  jobId: string;
  estimatedCost: number;
  provider: string;
  action: string;
  sceneId?: string;
}

type WsEvent = StepCompletedEvent | StepFailedEvent | ApprovalRequiredEvent;

const DEFAULT_WS_URL = "ws://localhost:3002";

/**
 * Connects to the backend WebSocket and handles scene regeneration progress events.
 *
 * step_completed    → markSceneClean (or updateSceneUrls if new URLs provided)
 * step_failed       → markSceneStatus("error") — isDirty stays true
 * approval_required → calls onApprovalRequired callback (FEATURE-09)
 */
export function useSceneWebSocket(
  projectId: string | null,
  onApprovalRequired?: (req: ApprovalRequest) => void,
): void {
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

      if ("type" in data && data.type === "step_completed") {
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
      } else if ("type" in data && data.type === "step_failed") {
        store.markSceneStatus(data.sceneId, "error");
      } else if ("event" in data && data.event === "approval_required") {
        onApprovalRequired?.({
          jobId: data.jobId,
          estimatedCost: data.estimatedCost,
          provider: data.provider,
          action: data.action,
          sceneId: data.sceneId,
        });
      }
    };

    return () => {
      ws.close();
    };
  }, [projectId, onApprovalRequired]);
}
