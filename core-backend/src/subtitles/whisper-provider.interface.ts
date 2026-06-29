/**
 * Provider interface for Whisper-based transcription (FEATURE-04).
 * Follows the same interface pattern as VideoProvider (FEATURE-01).
 */

import type { TranscriptionResult } from "./subtitle.types";

export interface WhisperProviderScores {
  /** 1-5: transcription accuracy */
  quality: number;
  /** 1-5: cost to use (5 = free) */
  cost: number;
  /** 1-5: uptime / error rate */
  reliability: number;
  /** 1-5: speed (5 = fastest) */
  latency: number;
}

export interface WhisperProvider {
  readonly name: string;
  readonly scores: WhisperProviderScores;

  /**
   * Returns true when this provider is usable (correct API keys configured,
   * or Python service is reachable for local).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Transcribe audio from the given S3 URL.
   * Returns word-level timestamps, detected language, and provider name.
   */
  transcribe(audioS3Url: string, language?: string): Promise<TranscriptionResult>;
}
