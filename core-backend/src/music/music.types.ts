export type MusicMood =
  | "cinematic"
  | "upbeat"
  | "calm"
  | "dramatic"
  | "inspiring"
  | "fun";

export type MusicProviderName = "jamendo" | "stability_audio" | "embedded";

export interface MusicGenerateParams {
  mood: MusicMood;
  /** Target total video duration in seconds — provider selects closest track */
  durationSeconds: number;
  projectId: string;
}

export interface MusicTrack {
  s3Url: string;
  provider: MusicProviderName;
  mood: MusicMood;
  title: string;
  artist?: string;
  /** SPDX license string, e.g. "CC-BY" or "CC0-1.0" */
  license: string;
  durationSeconds: number;
  generatedAt: string;
}
