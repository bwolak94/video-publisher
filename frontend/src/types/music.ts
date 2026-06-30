export type MusicMood = "cinematic" | "upbeat" | "calm" | "dramatic" | "inspiring" | "fun";
export type MusicProviderName = "jamendo" | "stability_audio" | "embedded";

export interface MusicTrack {
  s3Url: string;
  provider: MusicProviderName;
  mood: MusicMood;
  title: string;
  artist?: string;
  license: string;
  durationSeconds: number;
  generatedAt: string;
}
