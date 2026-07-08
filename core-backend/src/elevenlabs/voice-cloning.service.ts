import { Injectable, Inject } from "@nestjs/common";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

export const VOICE_CLONE_HTTP = Symbol("VOICE_CLONE_HTTP");

const ELEVEN_BASE = "https://api.elevenlabs.io";

export interface ClonedVoice {
  voiceId: string;
  name: string;
  description?: string;
  labels?: Record<string, string>;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

/**
 * ElevenLabs voice listing and instant voice cloning.
 *
 * Clone: supply an S3 key of a clean audio sample (30 s minimum, WAV/MP3).
 * The voice is associated with your ElevenLabs account and can be used
 * as `voiceId` in any TTS request.
 */
@Injectable()
export class VoiceCloningService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(VOICE_CLONE_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.bucket =
      process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "eu-central-1",
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }

  /**
   * List all voices available in the configured ElevenLabs account
   * (pre-built + user-cloned).
   */
  async listVoices(): Promise<ElevenLabsVoice[]> {
    const apiKey = await this.getApiKey();
    const response = await this.httpFetch(`${ELEVEN_BASE}/v1/voices`, {
      headers: { "xi-api-key": apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ElevenLabs list voices failed: HTTP ${response.status} — ${text}`);
    }

    const data: any = await response.json();
    return (data.voices ?? []) as ElevenLabsVoice[];
  }

  /**
   * Create an instant voice clone from an audio file stored in S3.
   *
   * @param name         Display name for the cloned voice
   * @param audioS3Key   S3 key of the audio sample (30 s+ of clean speech)
   * @param description  Optional description
   * @param labels       Optional key-value labels (e.g. { gender: "female" })
   */
  async cloneVoice(
    name: string,
    audioS3Key: string,
    description?: string,
    labels?: Record<string, string>,
  ): Promise<ClonedVoice> {
    const apiKey = await this.getApiKey();

    logger.info({ name, audioS3Key }, "Starting voice clone");

    // Download audio from S3
    const audioBuffer = await this.downloadFromS3(audioS3Key);

    // Build multipart form
    const form = new FormData();
    form.append("name", name);
    if (description) form.append("description", description);
    if (labels) form.append("labels", JSON.stringify(labels));

    // Detect content type from S3 key extension
    const ext = audioS3Key.split(".").pop()?.toLowerCase() ?? "mp3";
    const contentType = ext === "wav" ? "audio/wav" : "audio/mpeg";
    const filename = `${name.replace(/\s+/g, "_")}.${ext}`;

    form.append("files", new Blob([audioBuffer.buffer as ArrayBuffer], { type: contentType }), filename);

    const response = await this.httpFetch(`${ELEVEN_BASE}/v1/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ElevenLabs voice clone failed: HTTP ${response.status} — ${text}`);
    }

    const data: any = await response.json();
    const voiceId = data.voice_id as string;

    logger.info({ name, voiceId }, "Voice clone created");
    return { voiceId, name, description, labels };
  }

  /**
   * Delete a cloned voice by ID.
   * Only user-created voices can be deleted; pre-built voices will return an error.
   */
  async deleteVoice(voiceId: string): Promise<void> {
    const apiKey = await this.getApiKey();

    const response = await this.httpFetch(`${ELEVEN_BASE}/v1/voices/${voiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ElevenLabs delete voice failed: HTTP ${response.status} — ${text}`);
    }

    logger.info({ voiceId }, "Voice clone deleted");
  }

  private async downloadFromS3(s3Key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private async getApiKey(): Promise<string> {
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
    const key = await this.settings.getPlaintext("integrations.elevenLabsKey");
    if (!key) throw new Error("ElevenLabs API key not configured");
    return key;
  }
}
