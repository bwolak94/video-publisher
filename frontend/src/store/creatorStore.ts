import { create } from "zustand";
import type { Language, VoiceProfile } from "@/lib/voice-profiles";
import { getVoiceProfile } from "@/lib/voice-profiles";

export type ChatStage = "chat" | "outline" | "storyboard" | "complete";

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
}

let messageCounter = 0;
const nextId = () => `msg-${++messageCounter}`;

export const useCreatorStore = create<CreatorState>((set) => ({
  messages: [],
  stage: "chat",
  isStreaming: false,
  outline: [],
  storyboardJson: null,
  language: "en",
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
      stage: "outline",
    }),

  updateOutlineBullet: (id, text) =>
    set((s) => ({
      outline: s.outline.map((b) => (b.id === id ? { ...b, text } : b)),
    })),

  setStoryboard: (json) => set({ storyboardJson: json, stage: "complete" }),

  setLanguage: (lang) =>
    set({ language: lang, voiceProfile: getVoiceProfile(lang) }),

  addFile: (file) =>
    set((s) => ({ uploadedFiles: [...s.uploadedFiles, file] })),

  removeFile: (name) =>
    set((s) => ({ uploadedFiles: s.uploadedFiles.filter((f) => f.name !== name) })),
}));
