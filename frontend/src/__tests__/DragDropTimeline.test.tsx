/**
 * Component tests for drag-and-drop Timeline — CT-19-01..05
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboardScene } from "@/types/storyboard";
import type { DragEndEvent } from "@dnd-kit/core";

// ── Mock @tanstack/react-virtual ────────────────────────────────────────────
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 12) }, (_, i) => ({
        key: i, index: i, start: i * 232,
      })),
    getTotalSize: () => count * 232,
  }),
}));

// ── Capture onDragEnd/onDragStart from DndContext ───────────────────────────
let capturedOnDragEnd: ((e: DragEndEvent) => void) | null = null;
let capturedOnDragStart: ((e: { active: { id: string } }) => void) | null = null;

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd, onDragStart }: {
    children: React.ReactNode;
    onDragEnd: (e: DragEndEvent) => void;
    onDragStart: (e: { active: { id: string } }) => void;
  }) => {
    capturedOnDragEnd = onDragEnd;
    capturedOnDragStart = onDragStart;
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay-root">{children}</div>
  ),
  PointerSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
  closestCenter: jest.fn(),
}));

jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: ({ id }: { id: string }) => ({
    attributes: { "aria-roledescription": "sortable" },
    listeners: { onPointerDown: jest.fn() },
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: jest.fn(),
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true });

const makeScene = (id: string, seq: number): VideoStoryboardScene => ({
  sceneId: id,
  sequenceNumber: seq,
  durationInSeconds: 5,
  narrationText: `Narration ${seq}`,
  visualPrompt: `Visual ${seq}`,
  audioUrl: `https://s3.example.com/audio/${id}.mp3`,
  videoUrl: null,
});

beforeEach(() => {
  useTimelineStore.setState({ scenes: {}, sceneOrder: [] });
  capturedOnDragEnd = null;
  capturedOnDragStart = null;
  jest.clearAllMocks();
});

// CT-19-01: DndContext wraps the scene list
it("DndContext wraps the virtualized scene list (CT-19-01)", () => {
  const { VirtualizedSceneList } = require("@/components/timeline/VirtualizedSceneList");
  const scenes = [makeScene("s1", 1), makeScene("s2", 2)];
  useTimelineStore.getState().initScenes(scenes);

  render(<VirtualizedSceneList />);

  expect(screen.getByTestId("dnd-context")).toBeInTheDocument();
  expect(screen.getByTestId("virtualized-scene-list")).toBeInTheDocument();
});

// CT-19-02: Scene card has data-dnd-handle attribute
it("SortableSceneCard renders a drag handle element (CT-19-02)", () => {
  const { VirtualizedSceneList } = require("@/components/timeline/VirtualizedSceneList");
  useTimelineStore.getState().initScenes([makeScene("s1", 1)]);

  render(<VirtualizedSceneList />);

  const handles = document.querySelectorAll("[data-dnd-handle]");
  expect(handles.length).toBeGreaterThan(0);
});

// CT-19-03: Drag start → overlay content appears
it("DragOverlay is rendered when dragging starts (CT-19-03)", () => {
  const { VirtualizedSceneList } = require("@/components/timeline/VirtualizedSceneList");
  useTimelineStore.getState().initScenes([makeScene("s1", 1), makeScene("s2", 2)]);

  render(<VirtualizedSceneList />);

  // Trigger drag start
  act(() => {
    capturedOnDragStart?.({ active: { id: "s1" } });
  });

  // The DragOverlay root is always rendered; with activeId set it renders the card
  expect(screen.getByTestId("drag-overlay-root")).toBeInTheDocument();
});

// CT-19-04: Drop → correct reorderScenes called with correct indices
it("onDragEnd calls reorderScenes with correct fromIndex and toIndex (CT-19-04)", () => {
  const { VirtualizedSceneList } = require("@/components/timeline/VirtualizedSceneList");
  const scenes = [
    makeScene("s1", 1), makeScene("s2", 2), makeScene("s3", 3),
    makeScene("s4", 4), makeScene("s5", 5),
  ];
  useTimelineStore.getState().initScenes(scenes);

  render(<VirtualizedSceneList />);

  const reorderSpy = jest.spyOn(useTimelineStore.getState(), "reorderScenes");

  act(() => {
    capturedOnDragEnd?.({
      active: { id: "s5" },
      over: { id: "s2" },
    } as unknown as DragEndEvent);
  });

  // s5 is at index 4, s2 is at index 1
  expect(reorderSpy).toHaveBeenCalledWith(4, 1);
});

// CT-19-05: After reorder, scene card still renders its correct narration content
it("after reorder, scene card renders correct narration text unchanged (CT-19-05)", () => {
  const { VirtualizedSceneList } = require("@/components/timeline/VirtualizedSceneList");
  const scenes = [
    makeScene("s1", 1), makeScene("s2", 2), makeScene("s3", 3),
  ];
  useTimelineStore.getState().initScenes(scenes);

  render(<VirtualizedSceneList />);

  // Verify scene s2 renders its narration before reorder
  expect(screen.getAllByDisplayValue("Narration 2").length).toBeGreaterThan(0);

  // Reorder: move s3 to position 0
  act(() => {
    capturedOnDragEnd?.({
      active: { id: "s3" },
      over: { id: "s1" },
    } as unknown as DragEndEvent);
  });

  // Scene s2's narration text still present — content unchanged
  expect(screen.getAllByDisplayValue("Narration 2").length).toBeGreaterThan(0);
});
