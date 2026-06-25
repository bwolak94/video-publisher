export interface TextOverlay {
  text: string;
  style: "standard" | "punchy" | "funny_sub";
  position?: "top" | "center" | "bottom";
}

export interface VideoStoryboardScene {
  sceneId: string;
  sequenceNumber: number;
  durationInSeconds?: number;
  narrationText: string;
  audioUrl?: string | null;
  audioCacheKey?: string | null;
  visualPrompt: string;
  videoUrl?: string | null;
  visualCacheKey?: string | null;
  isDirty?: boolean;
  textOverlay?: TextOverlay | null;
}

export interface VideoStoryboardMeta {
  title: string;
  description?: string;
  tags?: string[];
  aspectRatio: "16:9" | "9:16";
  language: "pl" | "en" | "de" | "fr" | "es";
  voiceId: string;
  toneProfile?: "informative" | "comedic" | "edgy" | "educational";
}

export interface VideoStoryboard {
  meta: VideoStoryboardMeta;
  timeline: VideoStoryboardScene[];
}
