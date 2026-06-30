import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Language, VoiceProfile } from "@/lib/voice-profiles";
import { getVoiceProfile } from "@/lib/voice-profiles";
import type { ResearchBrief, SearchDepth } from "@/types/research";
import type { ReferenceAnalysisBrief } from "@/types/reference-analysis";

export type ChatStage = "chat" | "research" | "outline" | "storyboard" | "complete";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export interface OutlineBullet {
  id: string;
  text: string;
}

interface CreatorState {
  // Chat
  messages: ChatMessage[];
  stage: ChatStage;
  isStreaming: boolean;

  // Research (FEATURE-05)
  researchBrief: ResearchBrief | null;
  researchDepth: SearchDepth;
  isResearching: boolean;

  // Reference Video Analysis (FEATURE-06)
  referenceVideoUrl: string | null;
  referenceAnalysis: ReferenceAnalysisBrief | null;

  // Outline
  outline: OutlineBullet[];

  // Storyboard (opaque JSON — not shown to user)
  storyboardJson: object | null;

  // Settings
  language: Language;
  voiceProfile: VoiceProfile;
  uploadedFiles: File[];

  // Actions
  addMessage: (msg: Omit<ChatMessage, "id">) => void;
  appendStreamToken: (token: string) => void;
  setStreaming: (v: boolean) => void;
  setStage: (stage: ChatStage) => void;
  setOutline: (bullets: string[]) => void;
  updateOutlineBullet: (id: string, text: string) => void;
  setStoryboard: (json: object) => void;
  setLanguage: (lang: Language) => void;
  addFile: (file: File) => void;
  removeFile: (name: string) => void;
  setResearchBrief: (brief: ResearchBrief | null) => void;
  setResearchDepth: (depth: SearchDepth) => void;
  setResearching: (v: boolean) => void;
  setReferenceVideo: (url: string | null, brief: ReferenceAnalysisBrief | null) => void;
}

let messageCounter = 0;
const nextId = () => `msg-${++messageCounter}`;

export const useCreatorStore = create<CreatorState>()(
  devtools(
    (set) => ({
      messages: [],
      stage: "chat" as ChatStage,
      isStreaming: false,
      researchBrief: null,
      researchDepth: "standard" as SearchDepth,
      isResearching: false,
      referenceVideoUrl: null,
      referenceAnalysis: null,
      outline: [],
      storyboardJson: null,
      language: "en" as Language,
      voiceProfile: getVoiceProfile("en"),
      uploadedFiles: [],

      addMessage: (msg) =>
        set((s) => ({ messages: [...s.messages, { id: nextId(), ...msg }] })),

      appendStreamToken: (token) =>
        set((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          if (last?.isStreaming) {
            msgs[msgs.length - 1] = { ...last, content: last.content + token };
          }
          return { messages: msgs };
        }),

      setStreaming: (v) => set({ isStreaming: v }),

      setStage: (stage) => set({ stage }),

      setOutline: (bullets) =>
        set({
          outline: bullets.map((text, i) => ({ id: `bullet-${i}`, text })),
          stage: "outline" as ChatStage,
        }),

      updateOutlineBullet: (id, text) =>
        set((s) => ({
          outline: s.outline.map((b) => (b.id === id ? { ...b, text } : b)),
        })),

      setStoryboard: (json) =>
        set({ storyboardJson: json, stage: "complete" as ChatStage }),

      setLanguage: (lang) =>
        set({ language: lang, voiceProfile: getVoiceProfile(lang) }),

      addFile: (file) =>
        set((s) => ({ uploadedFiles: [...s.uploadedFiles, file] })),

      removeFile: (name) =>
        set((s) => ({
          uploadedFiles: s.uploadedFiles.filter((f) => f.name !== name),
        })),

      setResearchBrief: (brief) => set({ researchBrief: brief }),
      setResearchDepth: (depth) => set({ researchDepth: depth }),
      setResearching: (v) => set({ isResearching: v }),
      setReferenceVideo: (url, brief) => set({ referenceVideoUrl: url, referenceAnalysis: brief }),
    }),
    { name: "CreatorStore", enabled: process.env.NODE_ENV === "development" }
  )
);

/** Alias for spec compliance (TASK-22 useChatStore deliverable) */
export const useChatStore = useCreatorStore;
