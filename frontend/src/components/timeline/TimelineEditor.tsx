"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { TimelineHeader } from "./TimelineHeader";
import { VirtualizedSceneList } from "./VirtualizedSceneList";
import { PreviewPanel } from "./PreviewPanel";
import { RestoreBanner } from "./RestoreBanner";
import { MusicPanel } from "./MusicPanel";
import { BudgetApprovalModal, type ApprovalRequest } from "./BudgetApprovalModal";
import { useSceneWebSocket } from "@/hooks/useSceneWebSocket";
import { usePersistTimeline } from "@/hooks/usePersistTimeline";
import {
  loadDraft,
  clearDraft,
  isServerNewer,
  type PersistedDraft,
} from "@/lib/storyboardStorage";
import { useTimelineStore } from "@/store/timelineStore";

interface TimelineEditorProps {
  projectId?: string;
  onRender?: () => void;
  /** Unix ms timestamp of the server's last update — used for conflict detection */
  serverUpdatedAt?: number;
}

export function TimelineEditor({
  projectId,
  onRender,
  serverUpdatedAt,
}: TimelineEditorProps) {
  // Budget approval modal state (FEATURE-09)
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);

  const handleApprovalRequired = useCallback((req: ApprovalRequest) => {
    setApprovalRequest(req);
  }, []);

  const handleApprove = useCallback((_jobId: string) => {
    setApprovalRequest(null);
  }, []);

  const handleReject = useCallback((_jobId: string) => {
    setApprovalRequest(null);
  }, []);

  // Connect WS for live step_completed / step_failed / approval_required events
  useSceneWebSocket(projectId ?? null, handleApprovalRequired);

  // Auto-persist timeline changes to localStorage/IndexedDB (TASK-21)
  usePersistTimeline(projectId);

  const [draft, setDraft] = useState<PersistedDraft | null>(null);

  // Check for persisted draft on mount
  useEffect(() => {
    if (!projectId) return;
    loadDraft(projectId).then(setDraft).catch(console.warn);
  }, [projectId]);

  const handleRestore = useCallback(async () => {
    if (!draft || !projectId) return;
    useTimelineStore.getState().restoreFromDraft(draft.scenes);
    await clearDraft(projectId).catch(console.warn);
    setDraft(null);
  }, [draft, projectId]);

  const handleDiscard = useCallback(async () => {
    if (!projectId) return;
    await clearDraft(projectId).catch(console.warn);
    setDraft(null);
  }, [projectId]);

  // Ref to the seekToScene function provided by PreviewPanel once mounted
  const seekFnRef = useRef<((sceneId: string) => void) | null>(null);

  const handleSeekReady = useCallback((fn: (sceneId: string) => void) => {
    seekFnRef.current = fn;
  }, []);

  const handleSceneClick = useCallback((sceneId: string) => {
    seekFnRef.current?.(sceneId);
  }, []);

  const serverNewer = draft != null && serverUpdatedAt != null
    ? isServerNewer(draft, serverUpdatedAt)
    : false;

  return (
    <div
      className="flex flex-col h-screen bg-gray-50"
      data-testid="timeline-editor"
    >
      {approvalRequest && (
        <BudgetApprovalModal
          request={approvalRequest}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
      <TimelineHeader onRender={onRender} projectId={projectId} />

      {draft && (
        <RestoreBanner
          savedAt={draft.savedAt}
          isServerNewer={serverNewer}
          onRestore={handleRestore}
          onDiscard={handleDiscard}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: editable scene list */}
        <div className="flex-1 overflow-hidden min-w-0">
          <VirtualizedSceneList
            projectId={projectId}
            onSceneClick={handleSceneClick}
          />
        </div>
        {/* Right: live preview panel + music controls */}
        <div
          className="w-1/3 min-w-64 max-w-2xl border-l border-gray-200 flex-shrink-0 flex flex-col"
          data-testid="preview-panel-wrapper"
        >
          <div className="flex-1 bg-black overflow-hidden">
            <PreviewPanel onSeekReady={handleSeekReady} />
          </div>
          <div className="p-3 bg-gray-50 border-t border-gray-200">
            <MusicPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
