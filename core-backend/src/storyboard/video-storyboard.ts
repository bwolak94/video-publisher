/** VideoStoryboard — Single Source of Truth (PRD §5.1) */

export interface StoryboardMeta {
  title: string;
  description?: string;
  tags?: string[];
  aspectRatio: "16:9" | "9:16";
  language: "pl" | "en" | "de" | "fr" | "es";
  voiceId: string;
  toneProfile?: "informative" | "comedic" | "edgy" | "educational";
}

export interface TextOverlay {
  text: string;
  style: "standard" | "punchy" | "funny_sub";
  position?: "top" | "center" | "bottom";
}

export interface StoryboardScene {
  sceneId: string;
  sequenceNumber: number;
  durationInSeconds?: number;
  narrationText: string;
  audioUrl?: string;
  audioCacheKey?: string;
  visualPrompt: string;
  videoUrl?: string;
  visualCacheKey?: string;
  isDirty?: boolean;
  textOverlay?: TextOverlay;
}

export interface VideoStoryboard {
  meta: StoryboardMeta;
  timeline: StoryboardScene[];
}
