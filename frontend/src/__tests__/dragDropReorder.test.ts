/**
 * Unit tests for drag-and-drop reorder — UT-19-01..04
 */
import { renderHook } from "@testing-library/react";
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboardScene } from "@/types/storyboard";
import { areScenesEqual } from "@/components/timeline/SceneCard";
import { useReorderDebounce } from "@/hooks/useReorderDebounce";

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
});

// UT-19-01: reorderScenes(fromIndex=4, toIndex=1) renormalizes sequenceNumbers 1..N
it("reorderScenes(4, 1) moves scene and produces sequential 1..N sequenceNumbers (UT-19-01)", () => {
  const scenes = Array.from({ length: 5 }, (_, i) => makeScene(`s${i + 1}`, i + 1));
  useTimelineStore.getState().initScenes(scenes);

  useTimelineStore.getState().reorderScenes(4, 1);

  const { sceneOrder, scenes: storeScenes } = useTimelineStore.getState();
  // s5 moved from index 4 to index 1
  expect(sceneOrder[1]).toBe("s5");
  // All sequenceNumbers are sequential 1..N
  sceneOrder.forEach((id, idx) => {
    expect(storeScenes[id].sequenceNumber).toBe(idx + 1);
  });
});

// UT-19-02: reorderScenes does NOT set isDirty = true on any scene
it("reorderScenes never sets isDirty = true (UT-19-02)", () => {
  const scenes = Array.from({ length: 5 }, (_, i) => makeScene(`s${i + 1}`, i + 1));
  useTimelineStore.getState().initScenes(scenes);

  useTimelineStore.getState().reorderScenes(0, 4);

  const { scenes: storeScenes } = useTimelineStore.getState();
  Object.values(storeScenes).forEach((scene) => {
    expect(scene.isDirty).toBe(false);
  });
});

// UT-19-03: sequenceNumbers are [1, 2, 3, 4, 5] with no gaps after reorder
it("sequenceNumbers are exactly [1,2,3,4,5] after reorder (UT-19-03)", () => {
  const scenes = Array.from({ length: 5 }, (_, i) => makeScene(`s${i + 1}`, i + 1));
  useTimelineStore.getState().initScenes(scenes);

  useTimelineStore.getState().reorderScenes(2, 0);

  const { sceneOrder, scenes: storeScenes } = useTimelineStore.getState();
  const seqNums = sceneOrder.map((id) => storeScenes[id].sequenceNumber);
  expect(seqNums).toEqual([1, 2, 3, 4, 5]);
});

// UT-19-04: debounced PATCH called once after rapid reorders
it("debounced PATCH is called once after rapid successive reorders (UT-19-04)", async () => {
  jest.useFakeTimers();
  const mockFetch = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = mockFetch;

  // Simulate using the hook by calling its returned function multiple times
  const scenes = Array.from({ length: 3 }, (_, i) => makeScene(`s${i + 1}`, i + 1));
  useTimelineStore.getState().initScenes(scenes);

  // We test the debounce logic directly by calling the returned callback repeatedly
  // The hook uses setTimeout internally
  const { result } = renderHook(() => useReorderDebounce("project-123"));
  const triggerPatch = result.current;

  // Fire 5 times rapidly
  triggerPatch();
  triggerPatch();
  triggerPatch();
  triggerPatch();
  triggerPatch();

  // Before debounce resolves: no fetch call yet
  expect(mockFetch).not.toHaveBeenCalled();

  // Advance timers past debounce window
  jest.runAllTimers();
  await Promise.resolve(); // flush microtasks

  // Only 1 fetch, not 5
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/projects/project-123/storyboard",
    expect.objectContaining({ method: "PATCH" })
  );

  jest.useRealTimers();
});

// Rule 6: areScenesEqual excludes sequenceNumber
it("areScenesEqual returns true when only sequenceNumber differs (Rule 6)", () => {
  const { scenes } = useTimelineStore.getState();
  const base = {
    sceneId: "s1",
    sequenceNumber: 1,
    durationInSeconds: 5,
    narrationText: "Hello",
    visualPrompt: "Flowers",
    audioUrl: "https://example.com/audio.mp3",
    audioCacheKey: null,
    videoUrl: null,
    visualCacheKey: null,
    isDirty: false,
    narrationDirty: false,
    visualDirty: false,
    committedNarrationText: "Hello",
    committedVisualPrompt: "Flowers",
    status: "idle" as const,
    textOverlay: null,
  };
  const reordered = { ...base, sequenceNumber: 3 };
  expect(areScenesEqual(base, reordered)).toBe(true);
});
