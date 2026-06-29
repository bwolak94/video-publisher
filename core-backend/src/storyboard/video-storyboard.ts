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

/** Word-level subtitle timestamp (stored per scene in storyboard JSONB) */
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

/** Full subtitle track attached to a scene (FEATURE-04) */
export interface SubtitleTrack {
  words: WordTimestamp[];
  srtS3Url: string;
  vttS3Url: string;
  language: string;
  provider: "whisper_local" | "whisper_api";
  generatedAt: string;
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
  videoProvider?: string;
  /** Auto-generated subtitle track (FEATURE-04) */
  subtitleTrack?: SubtitleTrack | null;
}

export interface VideoStoryboard {
  meta: StoryboardMeta;
  timeline: StoryboardScene[];
}
