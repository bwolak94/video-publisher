/**
 * Unit + component tests for dirty-flag selective regeneration — TASK-18
 * UT-18-01..07, CT-18-01..05
 */
import { useTimelineStore } from "@/store/timelineStore";
import { estimateCost } from "@/lib/cost-estimation";
import type { VideoStoryboardScene } from "@/types/storyboard";

const makeScene = (id: string, seq = 1): VideoStoryboardScene => ({
  sceneId: id,
  sequenceNumber: seq,
  durationInSeconds: 5,
  narrationText: "Original narration",
  visualPrompt: "Original visual prompt",
  audioUrl: "https://s3.example.com/audio.mp3",
  videoUrl: null,
  isDirty: false,
});

beforeEach(() => {
  useTimelineStore.setState({ scenes: {}, sceneOrder: [] });
});

// ──────────────────────────────────────────────────────
// Unit Tests
// ──────────────────────────────────────────────────────

// UT-18-01: updateSceneField on narrationText → isDirty = true
it("updateSceneField narrationText sets isDirty = true (UT-18-01)", () => {
  useTimelineStore.getState().initScenes([makeScene("s1")]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "New text");

  const { isDirty, narrationDirty } = useTimelineStore.getState().scenes["s1"];
  expect(isDirty).toBe(true);
  expect(narrationDirty).toBe(true);
});

// UT-18-02: updateSceneField on unrelated field → isDirty = true (always dirty)
it("updateSceneField on durationInSeconds sets isDirty = true (UT-18-02)", () => {
  useTimelineStore.getState().initScenes([makeScene("s1")]);
  useTimelineStore.getState().updateSceneField("s1", "durationInSeconds", 10);

  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(true);
});

// UT-18-03: getDirtySceneIds with 3 dirty scenes returns 3 IDs
it("getDirtySceneIds returns 3 IDs when 3 scenes are dirty (UT-18-03)", () => {
  useTimelineStore.getState().initScenes([
    makeScene("a"), makeScene("b"), makeScene("c"),
  ]);
  useTimelineStore.getState().updateSceneField("a", "narrationText", "Changed");
  useTimelineStore.getState().updateSceneField("b", "narrationText", "Changed");
  useTimelineStore.getState().updateSceneField("c", "narrationText", "Changed");

  expect(useTimelineStore.getState().getDirtySceneIds()).toHaveLength(3);
});

// UT-18-04: markSceneClean on step_completed → isDirty = false
it("markSceneClean clears isDirty and granular flags (UT-18-04)", () => {
  useTimelineStore.getState().initScenes([makeScene("s1")]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Changed");
  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(true);

  // Simulate step_completed → markSceneClean
  useTimelineStore.getState().markSceneClean("s1");

  const scene = useTimelineStore.getState().scenes["s1"];
  expect(scene.isDirty).toBe(false);
  expect(scene.narrationDirty).toBe(false);
  expect(scene.visualDirty).toBe(false);
});

// UT-18-05: markSceneClean NOT called on step_failed → isDirty remains true
it("markSceneStatus('error') does not clear isDirty (UT-18-05)", () => {
  useTimelineStore.getState().initScenes([makeScene("s1")]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Changed");

  // Simulate step_failed — only markSceneStatus is called, NOT markSceneClean
  useTimelineStore.getState().markSceneStatus("s1", "error");

  const scene = useTimelineStore.getState().scenes["s1"];
  expect(scene.isDirty).toBe(true);   // still dirty
  expect(scene.status).toBe("error");
});

// UT-18-06: cost estimate — 3 audio-only dirty scenes → $0.15
it("estimateCost for 3 audio-only scenes = $0.15 (UT-18-06)", () => {
  const scenes = Array.from({ length: 3 }, () => ({
    narrationDirty: true,
    visualDirty: false,
  }));
  expect(estimateCost(scenes)).toBeCloseTo(0.15);
});

// UT-18-07: cost estimate — 4 audio+video dirty scenes → $0.80
it("estimateCost for 4 audio+video scenes = $0.80 (UT-18-07)", () => {
  const scenes = Array.from({ length: 4 }, () => ({
    narrationDirty: true,
    visualDirty: true,
  }));
  expect(estimateCost(scenes)).toBeCloseTo(0.8);
});

// Bonus: UC-03 undo detection — reverting narrationText to original clears isDirty
it("reverting narrationText to original value clears isDirty (UC-03 undo)", () => {
  useTimelineStore.getState().initScenes([makeScene("s1")]);

  // Edit narration
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Changed text");
  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(true);

  // Undo: revert to original value ("Original narration")
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Original narration");
  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(false);
  expect(useTimelineStore.getState().scenes["s1"].narrationDirty).toBe(false);
});
