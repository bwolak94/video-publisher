/** VideoStoryboard — Single Source of Truth (PRD §5.1) */

export type MusicMood = "cinematic" | "upbeat" | "calm" | "dramatic" | "inspiring" | "fun";

export interface MusicTrack {
  s3Url: string;
  provider: "jamendo" | "stability_audio" | "embedded";
  mood: MusicMood;
  title: string;
  artist?: string;
  license: string;
  durationSeconds: number;
  generatedAt: string;
}

export interface StoryboardMeta {
  title: string;
  description?: string;
  tags?: string[];
  aspectRatio: "16:9" | "9:16" | "1:1";
  language: "pl" | "en" | "de" | "fr" | "es";
  voiceId: string;
  toneProfile?: "informative" | "comedic" | "edgy" | "educational";
  /** Background music track (FEATURE-03) */
  musicTrack?: MusicTrack | null;
  /** Preferred music mood for generation */
  musicMood?: MusicMood;
  /** Music volume relative to narration (0.0-1.0, default 0.3) */
  musicVolume?: number;
  /** Target total duration for the video in seconds — used for pre-render duration validation (I7) */
  targetDurationSeconds?: number;
  /** I9: Music fade-in length in seconds applied at the start of the track (default 0) */
  musicFadeInSeconds?: number;
  /** I9: Music fade-out length in seconds applied at the end of the track (default 2) */
  musicFadeOutSeconds?: number;
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

/** Avatar / talking-head configuration for a scene (FEATURE-11) */
export interface AvatarConfig {
  /** Provider to use for avatar generation */
  provider: "heygen" | "did" | "wav2lip_local";
  /** s3:// URL of the presenter photo / avatar image */
  avatarImageUrl: string;
  /** HeyGen avatar_id (required for HeyGen provider) */
  avatarId?: string;
  /** Override the scene voice for dubbing (if not set, uses scene voiceId) */
  voiceId?: string;
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
  /** Talking-head avatar configuration (FEATURE-11) */
  avatarConfig?: AvatarConfig | null;
  /** I9: Per-scene subtitle style override — overrides project-level default at render time */
  subtitleStyle?: "standard" | "punchy" | "karaoke";
}

export interface VideoStoryboard {
  meta: StoryboardMeta;
  timeline: StoryboardScene[];
}
