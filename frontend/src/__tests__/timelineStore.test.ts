/**
 * Unit tests for useTimelineStore — UT-22-01..08 (TASK-22 / TASK-17)
 */
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboardScene } from "@/types/storyboard";

const makeScene = (overrides: Partial<VideoStoryboardScene> = {}): VideoStoryboardScene => ({
  sceneId: "scene-001",
  sequenceNumber: 1,
  durationInSeconds: 5,
  narrationText: "Hello world",
  visualPrompt: "A sunny day in the park",
  audioUrl: "https://s3.example.com/audio/001.mp3",
  videoUrl: "https://s3.example.com/video/001.mp4",
  isDirty: false,
  ...overrides,
});

beforeEach(() => {
  useTimelineStore.setState({ scenes: {}, sceneOrder: [] });
});

// UT-22-01: initScenes converts array to Record keyed by sceneId
it("initScenes converts timeline array to Record keyed by sceneId (UT-22-01)", () => {
  const timeline = [
    makeScene({ sceneId: "a1", sequenceNumber: 1 }),
    makeScene({ sceneId: "a2", sequenceNumber: 2 }),
  ];
  useTimelineStore.getState().initScenes(timeline);

  const { scenes, sceneOrder } = useTimelineStore.getState();
  expect(scenes["a1"].narrationText).toBe("Hello world");
  expect(scenes["a2"].narrationText).toBe("Hello world");
  expect(sceneOrder).toEqual(["a1", "a2"]);
});

// UT-22-02: updateSceneField sets field and marks isDirty = true
it("updateSceneField updates narrationText and sets isDirty = true (UT-22-02)", () => {
  useTimelineStore.getState().initScenes([makeScene({ sceneId: "s1" })]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Updated text");

  const scene = useTimelineStore.getState().scenes["s1"];
  expect(scene.narrationText).toBe("Updated text");
  expect(scene.isDirty).toBe(true);
});

// UT-22-03: markSceneClean sets isDirty = false
it("markSceneClean sets isDirty to false (UT-22-03)", () => {
  useTimelineStore.getState().initScenes([makeScene({ sceneId: "s1" })]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Changed");
  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(true);

  useTimelineStore.getState().markSceneClean("s1");
  expect(useTimelineStore.getState().scenes["s1"].isDirty).toBe(false);
});

// UT-22-04: reorderScenes moves item and renormalizes sequenceNumbers
it("reorderScenes moves scene and renormalizes sequenceNumbers (UT-22-04)", () => {
  const timeline = [
    makeScene({ sceneId: "a", sequenceNumber: 1 }),
    makeScene({ sceneId: "b", sequenceNumber: 2 }),
    makeScene({ sceneId: "c", sequenceNumber: 3 }),
    makeScene({ sceneId: "d", sequenceNumber: 4 }),
    makeScene({ sceneId: "e", sequenceNumber: 5 }),
  ];
  useTimelineStore.getState().initScenes(timeline);

  // Move index 4 to index 1 (move "e" after "a")
  useTimelineStore.getState().reorderScenes(4, 1);

  const { sceneOrder, scenes } = useTimelineStore.getState();
  expect(sceneOrder[1]).toBe("e");
  // sequenceNumbers renormalized
  sceneOrder.forEach((id, i) => {
    expect(scenes[id].sequenceNumber).toBe(i + 1);
  });
});

// UT-22-05: getDirtySceneIds returns array of dirty scene IDs
it("getDirtySceneIds returns IDs of all dirty scenes (UT-22-05)", () => {
  const timeline = [
    makeScene({ sceneId: "s1" }),
    makeScene({ sceneId: "s2" }),
    makeScene({ sceneId: "s3" }),
  ];
  useTimelineStore.getState().initScenes(timeline);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Changed");
  useTimelineStore.getState().updateSceneField("s3", "visualPrompt", "New prompt");

  const dirtyIds = useTimelineStore.getState().getDirtySceneIds();
  expect(dirtyIds).toHaveLength(2);
  expect(dirtyIds).toContain("s1");
  expect(dirtyIds).toContain("s3");
  expect(dirtyIds).not.toContain("s2");
});

// UT-22-06: updateSceneField for scene A does not mutate scene B reference
it("updateSceneField for scene A does not change scene B reference (UT-22-06)", () => {
  useTimelineStore.getState().initScenes([
    makeScene({ sceneId: "A" }),
    makeScene({ sceneId: "B" }),
  ]);

  const sceneBBefore = useTimelineStore.getState().scenes["B"];
  useTimelineStore.getState().updateSceneField("A", "narrationText", "New text for A");
  const sceneBAfter = useTimelineStore.getState().scenes["B"];

  // With immer, unchanged objects keep the same reference
  expect(sceneBBefore).toBe(sceneBAfter);
});

// UT-22-07: markSceneStatus sets status field
it("markSceneStatus sets scene status (UT-22-07)", () => {
  useTimelineStore.getState().initScenes([makeScene({ sceneId: "s1" })]);
  useTimelineStore.getState().markSceneStatus("s1", "regenerating");
  expect(useTimelineStore.getState().scenes["s1"].status).toBe("regenerating");
});

// UT-22-08: updateSceneUrls sets URLs and marks scene clean
it("updateSceneUrls sets audioUrl, videoUrl and clears isDirty (UT-22-08)", () => {
  useTimelineStore.getState().initScenes([makeScene({ sceneId: "s1" })]);
  useTimelineStore.getState().updateSceneField("s1", "narrationText", "Dirty change");

  useTimelineStore
    .getState()
    .updateSceneUrls("s1", "https://s3.example.com/new-audio.mp3", "https://s3.example.com/new-video.mp4");

  const scene = useTimelineStore.getState().scenes["s1"];
  expect(scene.audioUrl).toBe("https://s3.example.com/new-audio.mp3");
  expect(scene.videoUrl).toBe("https://s3.example.com/new-video.mp4");
  expect(scene.isDirty).toBe(false);
  expect(scene.status).toBe("idle");
});
