/**
 * Subtitle types shared between the timeline store, API responses,
 * and the Remotion SubtitleOverlay component (FEATURE-04).
 */

export interface WordTimestamp {
  word: string;
  start: number;       // seconds from start of audio
  end: number;         // seconds from start of audio
  confidence: number;  // 0-1
}

export interface SubtitleTrack {
  words: WordTimestamp[];
  srtUrl: string;   // public URL for the .srt file
  vttUrl: string;   // public URL for the .vtt file
  language: string;
  provider: "whisper_local" | "whisper_api";
  generatedAt: string;
}
