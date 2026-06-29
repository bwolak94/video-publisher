/**
 * WhisperLocalService — calls the Python ai-backend faster-whisper endpoint.
 *
 * Free, no API key needed. Requires the ai-backend service to be running.
 * Scores: quality=5, cost=5, reliability=3, latency=3  → composite=34
 */

import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import type { WhisperProvider, WhisperProviderScores } from "./whisper-provider.interface";
import type { TranscriptionResult } from "./subtitle.types";

const logger = pino({ level: "info" });

export const WHISPER_LOCAL_HTTP = Symbol("WHISPER_LOCAL_HTTP");

@Injectable()
export class WhisperLocalService implements WhisperProvider {
  readonly name = "whisper_local";

  readonly scores: WhisperProviderScores = {
    quality: 5,
    cost: 5,       // free
    reliability: 3,
    latency: 3,
  };

  private readonly breaker = new CircuitBreaker("whisper_local", 3, 60_000);

  constructor(
    @Inject(WHISPER_LOCAL_HTTP) private readonly httpFetch: typeof fetch,
  ) {}

  async isAvailable(): Promise<boolean> {
    const url = `${this.backendUrl()}/health`;
    try {
      const res = await this.httpFetch(url, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async transcribe(audioS3Url: string, language = "en"): Promise<TranscriptionResult> {
    return this.breaker.execute(async () => {
      const publicAudioUrl = this.toPublicUrl(audioS3Url);

      const res = await this.httpFetch(`${this.backendUrl()}/subtitles/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: publicAudioUrl, language }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Whisper local transcription failed: ${res.status} — ${detail}`);
      }

      const data: any = await res.json();
      logger.info({ audioS3Url, wordCount: data.words?.length, language: data.language }, "Whisper local transcription done");

      return {
        words: data.words ?? [],
        language: data.language ?? language,
        provider: "whisper_local" as const,
      };
    });
  }

  private backendUrl(): string {
    return process.env.AI_BACKEND_URL ?? "http://ai-backend:8000";
  }

  /**
   * Convert s3://bucket/key to public MinIO URL so the Python service can download it.
   * Falls back to the URL as-is if MINIO_PUBLIC_URL is not set.
   */
  private toPublicUrl(s3Url: string): string {
    const publicBase = process.env.MINIO_PUBLIC_URL;
    if (!publicBase) return s3Url;
    if (s3Url.startsWith("s3://")) {
      return `${publicBase}/${s3Url.slice("s3://".length)}`;
    }
    return s3Url;
  }
}
