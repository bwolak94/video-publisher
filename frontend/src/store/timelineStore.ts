import { create } from "zustand";
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

export const useTimelineStore = create<TimelineState>()(
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
            status: "idle",
            textOverlay: scene.textOverlay ?? null,
          };
          draft.sceneOrder.push(scene.sceneId);
        }
      }),

    updateSceneField: (sceneId, field, value) =>
      set((draft) => {
        if (!draft.scenes[sceneId]) return;
        Object.assign(draft.scenes[sceneId], { [field]: value, isDirty: true });
      }),

    markSceneClean: (sceneId) =>
      set((draft) => {
        if (draft.scenes[sceneId]) draft.scenes[sceneId].isDirty = false;
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
        draft.scenes[sceneId].audioUrl = audioUrl;
        draft.scenes[sceneId].videoUrl = videoUrl;
        draft.scenes[sceneId].isDirty = false;
        draft.scenes[sceneId].status = "idle";
      }),

    getDirtySceneIds: () => {
      const { scenes } = get();
      return Object.keys(scenes).filter((id) => scenes[id].isDirty);
    },
  }))
);
