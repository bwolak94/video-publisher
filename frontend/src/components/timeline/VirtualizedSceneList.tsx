"use client";
import React, { useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTimelineStore } from "@/store/timelineStore";
import { SortableSceneCard } from "./SortableSceneCard";
import { SceneCard } from "./SceneCard";
import { useReorderDebounce } from "@/hooks/useReorderDebounce";

const ESTIMATED_SCENE_HEIGHT = 232; // 220 + 12 handle
const OVERSCAN = 5;

interface VirtualizedSceneListProps {
  projectId?: string;
  onSceneClick?: (sceneId: string) => void;
}

export function VirtualizedSceneList({ projectId, onSceneClick }: VirtualizedSceneListProps) {
  const sceneOrder = useTimelineStore((s) => s.sceneOrder);
  const parentRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const triggerPatch = useReorderDebounce(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = sceneOrder.indexOf(active.id as string);
      const to = sceneOrder.indexOf(over.id as string);
      if (from !== -1 && to !== -1) {
        useTimelineStore.getState().reorderScenes(from, to);
        triggerPatch();
      }
    },
    [sceneOrder, triggerPatch]
  );

  const virtualizer = useVirtualizer({
    count: sceneOrder.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_SCENE_HEIGHT,
    overscan: OVERSCAN,
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sceneOrder} strategy={verticalListSortingStrategy}>
        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto px-4 py-2"
          data-testid="virtualized-scene-list"
          style={{ height: "100%" }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <SortableSceneCard
                  sceneId={sceneOrder[virtualItem.index]}
                  onSeekClick={
                    onSceneClick
                      ? () => onSceneClick(sceneOrder[virtualItem.index])
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        </div>
        {/* Add Scene button */}
        <div className="px-4 py-3">
          <button
            onClick={() => useTimelineStore.getState().addScene()}
            className="w-full py-2 text-sm text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-colors"
          >
            + Add Scene
          </button>
        </div>
      </SortableContext>

      {/* Semi-transparent overlay shown while dragging */}
      <DragOverlay>
        {activeId ? (
          <div data-testid="drag-overlay" className="opacity-80 rotate-1 shadow-2xl">
            <SceneCard sceneId={activeId} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
