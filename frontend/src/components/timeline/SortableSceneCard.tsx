"use client";
import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SceneCard } from "./SceneCard";

interface SortableSceneCardProps {
  sceneId: string;
}

export function SortableSceneCard({ sceneId }: SortableSceneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sceneId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle — separate from the card content so clicks inside card still work */}
      <div
        {...attributes}
        {...listeners}
        data-dnd-handle
        className="flex items-center justify-center w-full py-1 cursor-grab text-gray-300 hover:text-gray-500 select-none"
        aria-label="Drag to reorder"
      >
        ⠿⠿⠿
      </div>
      <SceneCard sceneId={sceneId} />
    </div>
  );
}
