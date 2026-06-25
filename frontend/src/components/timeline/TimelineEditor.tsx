"use client";
import React from "react";
import { TimelineHeader } from "./TimelineHeader";
import { VirtualizedSceneList } from "./VirtualizedSceneList";

interface TimelineEditorProps {
  onRender?: () => void;
}

export function TimelineEditor({ onRender }: TimelineEditorProps) {
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
