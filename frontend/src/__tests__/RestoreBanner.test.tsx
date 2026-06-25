/**
 * Component tests for localStorage/IndexedDB persistence — CT-21-01..05
 */
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboardScene } from "@/types/storyboard";
import type { PersistedDraft } from "@/lib/storyboardStorage";

// ── Mock storyboardStorage ───────────────────────────────────────────────────
const mockLoadDraft = jest.fn<Promise<PersistedDraft | null>, [string]>();
const mockClearDraft = jest.fn().mockResolvedValue(undefined);
const mockSaveDraft = jest.fn().mockResolvedValue(undefined);
const mockIsServerNewer = jest.fn().mockReturnValue(false);

jest.mock("@/lib/storyboardStorage", () => ({
  loadDraft: (id: string) => mockLoadDraft(id),
  clearDraft: (id: string) => mockClearDraft(id),
  saveDraft: (d: unknown) => mockSaveDraft(d),
  serializeScene: jest.fn((scene: unknown) => scene),
  isServerNewer: (draft: unknown, ts: number) => mockIsServerNewer(draft, ts),
}));

// ── Mock heavy timeline dependencies ────────────────────────────────────────
jest.mock("@/hooks/useSceneWebSocket", () => ({
  useSceneWebSocket: jest.fn(),
}));

jest.mock("@/components/timeline/VirtualizedSceneList", () => ({
  VirtualizedSceneList: () => <div data-testid="scene-list" />,
}));

jest.mock("@/components/timeline/PreviewPanel", () => ({
  PreviewPanel: () => <div data-testid="preview-panel" />,
}));

jest.mock("@/components/timeline/TimelineHeader", () => ({
  TimelineHeader: () => <div data-testid="timeline-header" />,
}));

const makeScene = (id: string, seq: number): VideoStoryboardScene => ({
  sceneId: id,
  sequenceNumber: seq,
  durationInSeconds: 5,
  narrationText: `Narration ${seq}`,
  visualPrompt: `Visual ${seq}`,
  audioUrl: `https://s3.example.com/audio/${id}.mp3`,
  videoUrl: null,
});

const makeDraft = (override?: Partial<PersistedDraft>): PersistedDraft => ({
  projectId: "proj-abc",
  savedAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago
  scenes: [
    {
      sceneId: "s1",
      sequenceNumber: 1,
      narrationText: "Edited narration",
      visualPrompt: "Visual 1",
      textOverlay: null,
      isDirty: true,
    },
  ],
  ...override,
});

beforeEach(() => {
  useTimelineStore.setState({ scenes: {}, sceneOrder: [] });
  mockLoadDraft.mockReset();
  mockClearDraft.mockReset();
  mockSaveDraft.mockReset();
  mockIsServerNewer.mockReturnValue(false);
  mockClearDraft.mockResolvedValue(undefined);
  mockSaveDraft.mockResolvedValue(undefined);
  localStorage.clear();
  jest.clearAllMocks();
  // Re-apply defaults after clearAllMocks
  mockClearDraft.mockResolvedValue(undefined);
  mockSaveDraft.mockResolvedValue(undefined);
  mockIsServerNewer.mockReturnValue(false);
});

// CT-21-01: On load with valid draft → Restore banner visible
it("shows restore banner when valid draft exists on load (CT-21-01)", async () => {
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  mockLoadDraft.mockResolvedValue(makeDraft());

  render(<TimelineEditor projectId="proj-abc" />);

  await waitFor(() => {
    expect(screen.getByTestId("restore-banner")).toBeInTheDocument();
  });
});

// CT-21-02: On load with expired draft (null) → No banner shown
it("does not show banner when loadDraft returns null (CT-21-02)", async () => {
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  mockLoadDraft.mockResolvedValue(null);

  render(<TimelineEditor projectId="proj-abc" />);

  // Wait for effect to run
  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.queryByTestId("restore-banner")).not.toBeInTheDocument();
});

// CT-21-03: Click "Restore" → Zustand state updated from draft
it("clicking Restore updates Zustand state from draft (CT-21-03)", async () => {
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  const user = userEvent.setup();

  useTimelineStore.getState().initScenes([makeScene("s1", 1)]);
  const draft = makeDraft();
  mockLoadDraft.mockResolvedValue(draft);

  render(<TimelineEditor projectId="proj-abc" />);

  await waitFor(() => expect(screen.getByTestId("restore-banner")).toBeInTheDocument());

  await user.click(screen.getByTestId("restore-btn"));

  // Banner dismissed
  expect(screen.queryByTestId("restore-banner")).not.toBeInTheDocument();
  // Draft cleared
  expect(mockClearDraft).toHaveBeenCalledWith("proj-abc");
  // Zustand updated: narrationText from draft
  expect(useTimelineStore.getState().scenes["s1"].narrationText).toBe("Edited narration");
  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(true);
});

// CT-21-04: Click "Discard" → localStorage key deleted, banner dismissed
it("clicking Discard clears draft and dismisses banner (CT-21-04)", async () => {
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  const user = userEvent.setup();

  mockLoadDraft.mockResolvedValue(makeDraft());

  render(<TimelineEditor projectId="proj-abc" />);

  await waitFor(() => expect(screen.getByTestId("restore-banner")).toBeInTheDocument());

  await user.click(screen.getByTestId("discard-btn"));

  expect(screen.queryByTestId("restore-banner")).not.toBeInTheDocument();
  expect(mockClearDraft).toHaveBeenCalledWith("proj-abc");
});

// CT-21-05: Edit scene after restore → auto-save triggers (saveDraft called)
it("editing a scene after restore triggers auto-save via usePersistTimeline (CT-21-05)", async () => {
  jest.useFakeTimers();
  const { TimelineEditor } = require("@/components/timeline/TimelineEditor");
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  useTimelineStore.getState().initScenes([makeScene("s1", 1)]);
  mockLoadDraft.mockResolvedValue(null);

  render(<TimelineEditor projectId="proj-abc" />);

  await act(async () => { await Promise.resolve(); });

  // Trigger a store change to fire the subscription
  act(() => {
    useTimelineStore.getState().updateSceneField("s1", "narrationText", "New text");
  });

  // Before debounce: not called
  expect(mockSaveDraft).not.toHaveBeenCalled();

  // Advance past 1s debounce
  await act(async () => { jest.advanceTimersByTime(1100); });

  expect(mockSaveDraft).toHaveBeenCalledTimes(1);
  expect(mockSaveDraft).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "proj-abc" })
  );

  jest.useRealTimers();
});
