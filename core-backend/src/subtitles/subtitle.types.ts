/**
 * Shared subtitle types (FEATURE-04).
 * These types flow from the Python transcription service all the way to the
 * Remotion SubtitleOverlay component — keep them stable across both.
 */

export type SubtitleProvider = "whisper_local" | "whisper_api";

export interface WordTimestamp {
  word: string;
  /** Absolute time in seconds from start of audio */
  start: number;
  /** Absolute time in seconds from start of audio */
  end: number;
  /** Whisper confidence score 0-1 */
  confidence: number;
}

/** Full subtitle track attached to a scene after transcription */
export interface SubtitleTrack {
  /** Word-level timestamps — used for Remotion karaoke overlay */
  words: WordTimestamp[];
  /** s3:// URL to the .srt file */
  srtS3Url: string;
  /** s3:// URL to the .vtt file */
  vttS3Url: string;
  language: string;
  provider: SubtitleProvider;
  generatedAt: string;
}

/** Result returned by any WhisperProvider implementation */
export interface TranscriptionResult {
  words: WordTimestamp[];
  language: string;
  provider: SubtitleProvider;
}
