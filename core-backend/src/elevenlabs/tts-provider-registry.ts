/**
 * TTS Provider Registry (FEATURE-08).
 *
 * Routes TTS generation to the correct backend based on voiceId prefix:
 *   - `piper_*` → local Piper TTS via ai-backend (free, no API key required)
 *   - anything else → ElevenLabs cloud TTS
 *
 * Piper audio is uploaded to S3/MinIO here (same convention as ElevenLabsService),
 * and the s3:// URL is written to Redis after a successful upload.
 */
import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { AudioCacheService } from "./audio-cache.service";
import { ElevenLabsService, type GenerateAudioParams } from "./elevenlabs.service";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

/**
 * Convert a `piper_*` voiceId to a Piper model name.
 *
 * Examples:
 *   "piper_en_us_lessac_medium"  → "en_US-lessac-medium"
 *   "piper_en_gb_alan_medium"    → "en_GB-alan-medium"
 *   "piper_de_de_thorsten_medium"→ "de_DE-thorsten-medium"
 *   "piper_pl_pl_gosia_medium"   → "pl_PL-gosia-medium"
 */
export function piperModelName(voiceId: string): string {
  const parts = voiceId.slice("piper_".length).split("_");
  const langCode = `${parts[0]}_${parts[1].toUpperCase()}`;
  const modelSuffix = parts.slice(2).join("-");
  return `${langCode}-${modelSuffix}`;
}

@Injectable()
export class TtsProviderRegistry {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly aiBackendUrl: string;

  constructor(
    private readonly elevenLabs: ElevenLabsService,
    private readonly cache: AudioCacheService,
    private readonly settings: SettingsService,
  ) {
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
    });
    this.aiBackendUrl = process.env.AI_BACKEND_URL ?? "http://localhost:8000";
  }

  /**
   * Generate audio for a scene, returning a stable s3:// URL.
   * Checks Redis cache first regardless of provider.
   */
  async generateAudio(params: GenerateAudioParams): Promise<string> {
    const { narrationText, voiceId } = params;
    const cacheKey = this.cache.computeCacheKey(narrationText, voiceId);

    const cached = await this.cache.getCached(cacheKey);
    if (cached) return cached;

    if (voiceId.startsWith("piper_")) {
      return this.generateWithPiper(narrationText, voiceId, cacheKey);
    }

    // Check ElevenLabs key from env var OR Settings DB (where the UI stores it)
    const elevenLabsKey =
      process.env.ELEVENLABS_API_KEY ||
      (await this.settings.getPlaintext("integrations.elevenLabsKey").catch(() => "")) ||
      "";

    if (elevenLabsKey) {
      return this.elevenLabs.generateAudio(params);
    }

    // No ElevenLabs key — fall back to OpenAI TTS
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      return this.generateWithOpenAI(narrationText, cacheKey, openaiKey);
    }

    // Last resort: still try ElevenLabs (will fail with a clear error message)
    return this.elevenLabs.generateAudio(params);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async generateWithOpenAI(
    text: string,
    cacheKey: string,
    apiKey: string,
  ): Promise<string> {
    logger.info({ textLen: text.length }, "OpenAI TTS fallback requested");

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: "alloy",
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`OpenAI TTS failed (${response.status}): ${detail}`);
    }

    const mp3Buffer = Buffer.from(await response.arrayBuffer());

    const s3Key = `audio/${cacheKey}.mp3`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: mp3Buffer,
        ContentType: "audio/mpeg",
      }),
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ s3Url }, "OpenAI TTS audio generated and cached");
    return s3Url;
  }

  private async generateWithPiper(
    text: string,
    voiceId: string,
    cacheKey: string,
  ): Promise<string> {
    const modelName = piperModelName(voiceId);
    logger.info({ modelName, textLen: text.length }, "Piper TTS requested");

    const response = await fetch(`${this.aiBackendUrl}/api/tts/piper`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_name: modelName }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`Piper TTS failed (${response.status}): ${detail}`);
    }

    const mp3Buffer = Buffer.from(await response.arrayBuffer());

    // S3 first, then Redis (Rule #3 — never write cache before S3 succeeds)
    const s3Key = `audio/${cacheKey}.mp3`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: mp3Buffer,
        ContentType: "audio/mpeg",
      }),
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ modelName, s3Url }, "Piper audio generated and cached");
    return s3Url;
  }
}
