"use client";
import React from "react";
import { TimelineHeader } from "./TimelineHeader";
import { VirtualizedSceneList } from "./VirtualizedSceneList";
import { useSceneWebSocket } from "@/hooks/useSceneWebSocket";

interface TimelineEditorProps {
  projectId?: string;
  onRender?: () => void;
}

export function TimelineEditor({ projectId, onRender }: TimelineEditorProps) {
  // Connect WS for live step_completed / step_failed events (TASK-18)
  useSceneWebSocket(projectId ?? null);

  return (
    <div
      className="flex flex-col h-screen bg-gray-50"
      data-testid="timeline-editor"
    >
      <TimelineHeader onRender={onRender} />
      <VirtualizedSceneList />
    </div>
  );
}
