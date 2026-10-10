import { Injectable } from "@nestjs/common";
import { fal } from "@fal-ai/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";

const logger = pino({ level: "info" });

/** Thrown when the lip-sync pipeline fails — callers should fall back to plain voiceover. */
export class LipsyncFallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LipsyncFallbackError";
  }
}

export interface GenerateLipsyncParams {
  jobId: string;
  sceneId: string;
  clipS3Url: string;
  dialog: string;
  voiceId: string;
}

export interface GenerateLipsyncResult {
  audioS3Url: string;
  clipS3Url: string;
  qaScore: number;
}

/**
 * Lip-sync pipeline (FR-21).
 *
 * Steps:
 *  1. Generate TTS audio from dialog via ElevenLabs API.
 *  2. Submit video + audio to fal-ai/sync-lipsync.
 *  3. Upload the result clip to S3 at `clips/{jobId}/{sceneId}/lipsync.mp4`.
 *  4. Return audioS3Url, final clipS3Url and a placeholder QA score.
 */
@Injectable()
export class LipsyncService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly elevenLabsBaseUrl: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    this.elevenLabsBaseUrl = process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "eu-central-1",
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }

  async generateLipsync(params: GenerateLipsyncParams): Promise<GenerateLipsyncResult> {
    const { jobId, sceneId, clipS3Url, dialog, voiceId } = params;

    let audioS3Url: string;
    let lipsyncClipUrl: string;

    try {
      // Step 1: TTS via ElevenLabs
      audioS3Url = await this.generateTts(dialog, voiceId, jobId, sceneId);

      // Step 2: fal-ai lip-sync
      lipsyncClipUrl = await this.runLipsync(clipS3Url, audioS3Url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ jobId, sceneId, err: message }, "lipsync pipeline failed — marking as fallback");
      throw new LipsyncFallbackError(`Lip-sync failed for scene ${sceneId}: ${message}`);
    }

    // Step 3: upload result to S3
    const finalClipS3Url = await this.uploadResultClip(lipsyncClipUrl, jobId, sceneId);

    // Step 4: return result with placeholder QA score
    return {
      audioS3Url,
      clipS3Url: finalClipS3Url,
      qaScore: 0.85,
    };
  }

  /**
   * Calls ElevenLabs TTS API, uploads the audio buffer to S3, and returns the s3:// URL.
   */
  protected async generateTts(dialog: string, voiceId: string, jobId: string, sceneId: string): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
    const url = `${this.elevenLabsBaseUrl}/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: dialog,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${body}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const s3Key = `clips/${jobId}/${sceneId}/dialog.mp3`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: audioBuffer,
        ContentType: "audio/mpeg",
      }),
    );

    logger.info({ jobId, sceneId, s3Key }, "lipsync TTS audio uploaded to S3");
    return `s3://${this.bucket}/${s3Key}`;
  }

  /**
   * Submits a clip + audio URL to fal-ai/sync-lipsync and returns the result video URL.
   */
  protected async runLipsync(videoUrl: string, audioUrl: string): Promise<string> {
    const result = await fal.subscribe("fal-ai/sync-lipsync", {
      input: { video_url: videoUrl, audio_url: audioUrl },
    });

    const resultAny = result as any;
    const outputUrl: string | undefined =
      resultAny?.video?.url ?? resultAny?.data?.video?.url;

    if (!outputUrl) {
      throw new Error("fal-ai/sync-lipsync returned no video URL");
    }

    return outputUrl;
  }

  /**
   * Downloads the lip-synced clip from the fal.ai CDN URL and re-uploads it to S3.
   * Returns the s3:// URL.
   */
  protected async uploadResultClip(sourceUrl: string, jobId: string, sceneId: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new LipsyncFallbackError(`Failed to download lipsync result (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const s3Key = `clips/${jobId}/${sceneId}/lipsync.mp4`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: "video/mp4",
      }),
    );

    logger.info({ jobId, sceneId, s3Key }, "lipsync result clip uploaded to S3");
    return `s3://${this.bucket}/${s3Key}`;
  }
}
