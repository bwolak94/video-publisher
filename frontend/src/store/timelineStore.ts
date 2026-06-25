import { createWithEqualityFn } from "zustand/traditional";
import { immer } from "zustand/middleware/immer";
import type { TextOverlay, VideoStoryboardScene } from "@/types/storyboard";

export interface SceneState {
  sceneId: string;
  sequenceNumber: number;
  durationInSeconds: number;
  narrationText: string;
  audioUrl: string | null;
  audioCacheKey: string | null;
  visualPrompt: string;
  videoUrl: string | null;
  visualCacheKey: string | null;
  isDirty: boolean;
  // Granular dirty tracking for cost estimation and undo detection (TASK-18)
  narrationDirty: boolean;
  visualDirty: boolean;
  committedNarrationText: string; // narration that corresponds to current audioUrl
  committedVisualPrompt: string;  // prompt that corresponds to current videoUrl
  status: "idle" | "regenerating" | "error";
  textOverlay: TextOverlay | null;
}

interface TimelineState {
  scenes: Record<string, SceneState>;
  sceneOrder: string[];
  // Actions
  initScenes: (timeline: VideoStoryboardScene[]) => void;
  updateSceneField: (sceneId: string, field: keyof SceneState, value: unknown) => void;
  markSceneClean: (sceneId: string) => void;
  markSceneStatus: (sceneId: string, status: SceneState["status"]) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  updateSceneUrls: (sceneId: string, audioUrl: string, videoUrl: string) => void;
  getDirtySceneIds: () => string[];
}

export const useTimelineStore = createWithEqualityFn<TimelineState>()(
  immer((set, get) => ({
    scenes: {},
    sceneOrder: [],

    initScenes: (timeline) =>
      set((draft) => {
        draft.scenes = {};
        draft.sceneOrder = [];
        for (const scene of timeline) {
          draft.scenes[scene.sceneId] = {
            sceneId: scene.sceneId,
            sequenceNumber: scene.sequenceNumber,
            durationInSeconds: scene.durationInSeconds ?? 5,
            narrationText: scene.narrationText,
            audioUrl: scene.audioUrl ?? null,
            audioCacheKey: scene.audioCacheKey ?? null,
            visualPrompt: scene.visualPrompt,
            videoUrl: scene.videoUrl ?? null,
            visualCacheKey: scene.visualCacheKey ?? null,
            isDirty: scene.isDirty ?? false,
            narrationDirty: false,
            visualDirty: false,
            committedNarrationText: scene.narrationText,
            committedVisualPrompt: scene.visualPrompt,
            status: "idle",
            textOverlay: scene.textOverlay ?? null,
          };
          draft.sceneOrder.push(scene.sceneId);
        }
      }),

    updateSceneField: (sceneId, field, value) =>
      set((draft) => {
        if (!draft.scenes[sceneId]) return;
        const scene = draft.scenes[sceneId];
        (scene as Record<string, unknown>)[field as string] = value;

        // For content fields: track granular dirty and support undo detection (UC-03)
        if (field === "narrationText") {
          scene.narrationDirty = value !== scene.committedNarrationText;
          scene.isDirty = scene.narrationDirty || scene.visualDirty;
        } else if (field === "visualPrompt") {
          scene.visualDirty = value !== scene.committedVisualPrompt;
          scene.isDirty = scene.narrationDirty || scene.visualDirty;
        } else {
          // Non-content fields always mark dirty
          scene.isDirty = true;
        }
      }),

    markSceneClean: (sceneId) =>
      set((draft) => {
        if (!draft.scenes[sceneId]) return;
        const scene = draft.scenes[sceneId];
        scene.isDirty = false;
        scene.narrationDirty = false;
        scene.visualDirty = false;
        scene.committedNarrationText = scene.narrationText;
        scene.committedVisualPrompt = scene.visualPrompt;
      }),

    markSceneStatus: (sceneId, status) =>
      set((draft) => {
        if (draft.scenes[sceneId]) draft.scenes[sceneId].status = status;
      }),

    reorderScenes: (fromIndex, toIndex) =>
      set((draft) => {
        const [moved] = draft.sceneOrder.splice(fromIndex, 1);
        draft.sceneOrder.splice(toIndex, 0, moved);
        draft.sceneOrder.forEach((id, i) => {
          draft.scenes[id].sequenceNumber = i + 1;
        });
      }),

    updateSceneUrls: (sceneId, audioUrl, videoUrl) =>
      set((draft) => {
        if (!draft.scenes[sceneId]) return;
        const scene = draft.scenes[sceneId];
        scene.audioUrl = audioUrl;
        scene.videoUrl = videoUrl;
        scene.isDirty = false;
        scene.narrationDirty = false;
        scene.visualDirty = false;
        scene.committedNarrationText = scene.narrationText;
        scene.committedVisualPrompt = scene.visualPrompt;
        scene.status = "idle";
      }),

    getDirtySceneIds: () => {
      const { scenes } = get();
      return Object.keys(scenes).filter((id) => scenes[id].isDirty);
    },
  }))
);
