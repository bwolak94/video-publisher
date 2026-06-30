import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { MusicTrack, MusicMood } from "@/types/music";

export interface ProjectState {
  projectId: string | null;
  title: string;
  mode: "worker" | "creator";
  pipelineStatus: "idle" | "running" | "completed" | "failed";
  musicTrack: MusicTrack | null;
  musicMood: MusicMood;
  musicVolume: number;
  // Actions
  setProject: (project: {
    id: string;
    title: string;
    mode: "worker" | "creator";
  }) => void;
  setPipelineStatus: (status: ProjectState["pipelineStatus"]) => void;
  setMusicTrack: (track: MusicTrack | null) => void;
  setMusicMood: (mood: MusicMood) => void;
  setMusicVolume: (volume: number) => void;
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    immer((set) => ({
      projectId: null,
      title: "",
      mode: "creator" as const,
      pipelineStatus: "idle" as const,
      musicTrack: null,
      musicMood: "cinematic" as MusicMood,
      musicVolume: 0.3,

      setProject: ({ id, title, mode }) =>
        set((draft) => {
          draft.projectId = id;
          draft.title = title;
          draft.mode = mode;
        }),

      setPipelineStatus: (status) =>
        set((draft) => {
          draft.pipelineStatus = status;
        }),

      setMusicTrack: (track) =>
        set((draft) => {
          draft.musicTrack = track;
        }),

      setMusicMood: (mood) =>
        set((draft) => {
          draft.musicMood = mood;
        }),

      setMusicVolume: (volume) =>
        set((draft) => {
          draft.musicVolume = Math.min(1, Math.max(0, volume));
        }),
    })),
    { name: "ProjectStore", enabled: process.env.NODE_ENV === "development" }
  )
);
