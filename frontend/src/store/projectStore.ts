import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export interface ProjectState {
  projectId: string | null;
  title: string;
  mode: "worker" | "creator";
  pipelineStatus: "idle" | "running" | "completed" | "failed";
  // Actions
  setProject: (project: {
    id: string;
    title: string;
    mode: "worker" | "creator";
  }) => void;
  setPipelineStatus: (status: ProjectState["pipelineStatus"]) => void;
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    immer((set) => ({
      projectId: null,
      title: "",
      mode: "creator" as const,
      pipelineStatus: "idle" as const,

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
    })),
    { name: "ProjectStore", enabled: process.env.NODE_ENV === "development" }
  )
);
