/**
 * WhisperApiService — calls OpenAI /v1/audio/transcriptions with word timestamps.
 *
 * Requires `integrations.openaiKey` in Settings.
 * Downloads audio from S3 then uploads to OpenAI as multipart/form-data.
 * Scores: quality=5, cost=2, reliability=5, latency=4  → composite=33
 */

import { Injectable, Inject } from "@nestjs/common";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { SettingsService } from "../settings/settings.service";
import type { WhisperProvider, WhisperProviderScores } from "./whisper-provider.interface";
import type { TranscriptionResult, WordTimestamp } from "./subtitle.types";

const logger = pino({ level: "info" });

export const WHISPER_API_HTTP = Symbol("WHISPER_API_HTTP");

@Injectable()
export class WhisperApiService implements WhisperProvider {
  readonly name = "whisper_api";

  readonly scores: WhisperProviderScores = {
    quality: 5,
    cost: 2,
    reliability: 5,
    latency: 4,
  };

  private readonly breaker = new CircuitBreaker("whisper_api", 5, 60_000);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(WHISPER_API_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async isAvailable(): Promise<boolean> {
    const key = await this.settings.getPlaintext("integrations.openaiKey");
    return !!(key || process.env.OPENAI_API_KEY);
  }

  async transcribe(audioS3Url: string, language = "en"): Promise<TranscriptionResult> {
    return this.breaker.execute(async () => {
      const audioBuffer = await this.downloadFromS3(audioS3Url);

      const apiKey = (await this.settings.getPlaintext("integrations.openaiKey"))
        ?? process.env.OPENAI_API_KEY
        ?? "";

      const form = new FormData();
      form.append("file", new Blob([audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer], { type: "audio/mpeg" }), "audio.mp3");
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      if (language) form.append("language", language);

      const res = await this.httpFetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI Whisper API error: ${res.status} — ${detail}`);
      }

      const data: any = await res.json();
      const words: WordTimestamp[] = (data.words ?? []).map((w: any) => ({
        word: w.word?.trim() ?? "",
        start: w.start ?? 0,
        end: w.end ?? 0,
        confidence: w.confidence ?? 1,
      }));

      logger.info({ audioS3Url, wordCount: words.length, language: data.language }, "Whisper API transcription done");

      return {
        words,
        language: data.language ?? language,
        provider: "whisper_api" as const,
      };
    });
  }

  protected async downloadFromS3(s3Url: string): Promise<Buffer> {
    const key = s3Url.startsWith("s3://")
      ? s3Url.slice(`s3://${this.bucket}/`.length)
      : s3Url;

    const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!Body) throw new Error(`Empty S3 body for ${s3Url}`);

    const chunks: Buffer[] = [];
    for await (const chunk of Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
