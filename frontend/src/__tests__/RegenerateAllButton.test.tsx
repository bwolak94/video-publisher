/**
 * Component tests for RegenerateAllButton + ConfirmRegenerateModal — CT-18-01..05
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboardScene } from "@/types/storyboard";

// Mock @tanstack/react-virtual (needed by VirtualizedSceneList in TimelineEditor)
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 12) }, (_, i) => ({
        key: i, index: i, start: i * 220,
      })),
    getTotalSize: () => count * 220,
  }),
}));

global.fetch = jest.fn();

const makeScene = (id: string, seq: number): VideoStoryboardScene => ({
  sceneId: id,
  sequenceNumber: seq,
  durationInSeconds: 5,
  narrationText: "Narration",
  visualPrompt: "Visual",
  audioUrl: "https://s3.example.com/audio.mp3",
  videoUrl: null,
});

beforeEach(() => {
  useTimelineStore.setState({ scenes: {}, sceneOrder: [] });
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockResolvedValue({
    json: () => Promise.resolve({}),
  });
});

// CT-18-01: Edit narration text → yellow/amber "unsaved" badge appears
it("editing narration shows unsaved badge on scene card (CT-18-01)", () => {
  // Import TimelineEditor which uses SceneMetadata that shows the badge
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  useTimelineStore.getState().initScenes([makeScene("s1", 1)]);

  render(<TimelineEditor />);

  const narrationInput = screen.getByTestId("narration-input");
  fireEvent.change(narrationInput, { target: { value: "Modified narration" } });

  // SceneMetadata renders "unsaved" badge when isDirty = true
  expect(screen.getByText("unsaved")).toBeInTheDocument();
});

// CT-18-02: Regenerate All with 3 dirty scenes → 3 API calls, 0 for clean
it("Regenerate All dispatches fetch only for dirty scenes (CT-18-02)", async () => {
  const { RegenerateAllButton } = require("@/components/timeline/RegenerateAllButton");

  const scenes = [
    makeScene("sc-1", 1), makeScene("sc-2", 2), makeScene("sc-3", 3),
    makeScene("sc-4", 4), makeScene("sc-5", 5),
  ];
  useTimelineStore.getState().initScenes(scenes);

  // Mark 3 scenes dirty, leave 2 clean
  useTimelineStore.getState().updateSceneField("sc-1", "narrationText", "Changed");
  useTimelineStore.getState().updateSceneField("sc-3", "narrationText", "Changed");
  useTimelineStore.getState().updateSceneField("sc-5", "narrationText", "Changed");

  render(<RegenerateAllButton />);

  await act(async () => {
    fireEvent.click(screen.getByTestId("regenerate-all-btn"));
  });

  // fetch called exactly 3 times — only for dirty scenes
  expect(global.fetch).toHaveBeenCalledTimes(3);
  const expectedOpts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visualPrompt: "Visual" }),
  };
  expect(global.fetch).toHaveBeenCalledWith("/api/scenes/sc-1/regenerate-visual", expectedOpts);
  expect(global.fetch).toHaveBeenCalledWith("/api/scenes/sc-3/regenerate-visual", expectedOpts);
  expect(global.fetch).toHaveBeenCalledWith("/api/scenes/sc-5/regenerate-visual", expectedOpts);
  expect(global.fetch).not.toHaveBeenCalledWith("/api/scenes/sc-2/regenerate-visual", expectedOpts);
  expect(global.fetch).not.toHaveBeenCalledWith("/api/scenes/sc-4/regenerate-visual", expectedOpts);
});

// CT-18-03: Regenerate All with 8 dirty scenes → confirmation modal shown
it("shows confirmation modal when more than 5 scenes are dirty (CT-18-03)", () => {
  const { RegenerateAllButton } = require("@/components/timeline/RegenerateAllButton");

  const scenes = Array.from({ length: 8 }, (_, i) => makeScene(`sc-${i}`, i + 1));
  useTimelineStore.getState().initScenes(scenes);
  scenes.forEach((s) =>
    useTimelineStore.getState().updateSceneField(s.sceneId, "narrationText", "Changed")
  );

  render(<RegenerateAllButton />);
  fireEvent.click(screen.getByTestId("regenerate-all-btn"));

  expect(screen.getByTestId("confirm-regenerate-modal")).toBeInTheDocument();
  expect(screen.getByText(/8 scenes/)).toBeInTheDocument();
});

// CT-18-04: Confirmation modal — cancel → no API calls dispatched
it("cancelling confirmation modal dispatches no API calls (CT-18-04)", async () => {
  const { RegenerateAllButton } = require("@/components/timeline/RegenerateAllButton");

  const scenes = Array.from({ length: 8 }, (_, i) => makeScene(`sc-${i}`, i + 1));
  useTimelineStore.getState().initScenes(scenes);
  scenes.forEach((s) =>
    useTimelineStore.getState().updateSceneField(s.sceneId, "narrationText", "Changed")
  );

  render(<RegenerateAllButton />);
  fireEvent.click(screen.getByTestId("regenerate-all-btn"));

  expect(screen.getByTestId("confirm-regenerate-modal")).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByTestId("modal-cancel-btn"));
  });

  expect(screen.queryByTestId("confirm-regenerate-modal")).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

// CT-18-05: WS step_completed → badge removed (isDirty cleared via markSceneClean)
it("markSceneClean (simulating step_completed) removes unsaved badge (CT-18-05)", () => {
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  useTimelineStore.getState().initScenes([makeScene("s1", 1)]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Changed");

  render(<TimelineEditor />);
  expect(screen.getByText("unsaved")).toBeInTheDocument();

  // Simulate WS step_completed → markSceneClean called
  act(() => {
    useTimelineStore.getState().markSceneClean("s1");
  });

  expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
});
