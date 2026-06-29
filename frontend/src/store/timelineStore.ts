import { createWithEqualityFn } from "zustand/traditional";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { TextOverlay, VideoStoryboardScene } from "@/types/storyboard";
import type { PersistedScene } from "@/lib/storyboardStorage";
import type { SubtitleTrack } from "@/types/subtitle";

function generateSceneId(): string {
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
  /** Provider that generated the current videoUrl: "runway" | "kling" | "pexels" | "archival" */
  videoProvider?: string;
  /** Generated subtitle track for this scene (FEATURE-04) */
  subtitleTrack?: SubtitleTrack | null;
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
  updateSceneUrls: (sceneId: string, audioUrl: string, videoUrl: string, videoProvider?: string) => void;
  updateSceneSubtitleTrack: (sceneId: string, track: SubtitleTrack) => void;
  getDirtySceneIds: () => string[];
  restoreFromDraft: (draftScenes: PersistedScene[]) => void;
  addScene: (afterSceneId?: string) => string;
  deleteScene: (sceneId: string) => void;
}

export const useTimelineStore = createWithEqualityFn<TimelineState>()(
  devtools(
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
            subtitleTrack: (scene as any).subtitleTrack ?? null,
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

    updateSceneUrls: (sceneId, audioUrl, videoUrl, videoProvider) =>
      set((draft) => {
        if (!draft.scenes[sceneId]) return;
        const scene = draft.scenes[sceneId];
        scene.audioUrl = audioUrl;
        scene.videoUrl = videoUrl;
        if (videoProvider) scene.videoProvider = videoProvider;
        scene.isDirty = false;
        scene.narrationDirty = false;
        scene.visualDirty = false;
        scene.committedNarrationText = scene.narrationText;
        scene.committedVisualPrompt = scene.visualPrompt;
        scene.status = "idle";
      }),

    updateSceneSubtitleTrack: (sceneId, track) =>
      set((draft) => {
        if (draft.scenes[sceneId]) draft.scenes[sceneId].subtitleTrack = track;
      }),

    getDirtySceneIds: () => {
      const { scenes } = get();
      return Object.keys(scenes).filter((id) => scenes[id].isDirty);
    },

    addScene: (afterSceneId) => {
      const sceneId = generateSceneId();
      set((draft) => {
        const insertAt = afterSceneId
          ? draft.sceneOrder.indexOf(afterSceneId) + 1
          : draft.sceneOrder.length;
        draft.scenes[sceneId] = {
          sceneId,
          sequenceNumber: insertAt + 1,
          durationInSeconds: 5,
          narrationText: "",
          audioUrl: null,
          audioCacheKey: null,
          visualPrompt: "",
          videoUrl: null,
          visualCacheKey: null,
          isDirty: true,
          narrationDirty: false,
          visualDirty: false,
          committedNarrationText: "",
          committedVisualPrompt: "",
          status: "idle",
          textOverlay: null,
        };
        draft.sceneOrder.splice(insertAt, 0, sceneId);
        draft.sceneOrder.forEach((id, i) => {
          draft.scenes[id].sequenceNumber = i + 1;
        });
      });
      return sceneId;
    },

    deleteScene: (sceneId) =>
      set((draft) => {
        delete draft.scenes[sceneId];
        draft.sceneOrder = draft.sceneOrder.filter((id) => id !== sceneId);
        draft.sceneOrder.forEach((id, i) => {
          draft.scenes[id].sequenceNumber = i + 1;
        });
      }),

    restoreFromDraft: (draftScenes) =>
      set((draft) => {
        for (const persisted of draftScenes) {
          const scene = draft.scenes[persisted.sceneId];
          if (!scene) continue;
          scene.narrationText = persisted.narrationText;
          scene.visualPrompt = persisted.visualPrompt;
          scene.textOverlay = persisted.textOverlay;
          scene.isDirty = persisted.isDirty;
          scene.narrationDirty = persisted.isDirty;
          scene.visualDirty = persisted.isDirty;
          scene.sequenceNumber = persisted.sequenceNumber;
        }
        // Restore scene ordering from draft (for drag-drop reorders)
        const draftOrder = draftScenes
          .map((s) => s.sceneId)
          .filter((id) => !!draft.scenes[id]);
        const serverOnly = draft.sceneOrder.filter(
          (id) => !draftOrder.includes(id)
        );
        draft.sceneOrder = [...draftOrder, ...serverOnly];
      }),
  })),
  { name: "TimelineStore", enabled: process.env.NODE_ENV === "development" }
  )
);
