/**
 * HeyGenService — HeyGen AI avatar video generation (FEATURE-11).
 *
 * Flow:
 *  1. POST /v2/video/generate  → receives video_id
 *  2. Poll GET /v1/video_status.get?video_id= until status === "completed"
 *  3. Download the delivery URL, upload to S3, return s3:// URL
 *
 * Scores: quality=5, cost=1, reliability=4, latency=2  → composite 27
 */
import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { SettingsService } from "../settings/settings.service";
import type { AvatarProvider } from "./avatar-provider.interface";

const logger = pino({ level: "info" });

export const HEYGEN_HTTP = Symbol("HEYGEN_HTTP");

const BASE_URL = "https://api.heygen.com";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

@Injectable()
export class HeyGenService implements AvatarProvider {
  readonly name = "heygen" as const;
  readonly scores = { quality: 5, cost: 1, reliability: 4, latency: 2 };

  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(HEYGEN_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async isAvailable(): Promise<boolean> {
    const key = await this.getApiKey();
    return key.length > 0;
  }

  async generate(params: { audioUrl: string; imageUrl: string; sceneId: string; avatarId?: string }): Promise<string> {
    const { audioUrl, imageUrl, sceneId, avatarId = "josh_lite3_20230714" } = params;
    const apiKey = await this.getApiKey();

    // Convert s3:// to public HTTPS — HeyGen needs a publicly accessible URL
    const publicAudioUrl = this.toPublicUrl(audioUrl);
    const publicImageUrl = this.toPublicUrl(imageUrl);

    logger.info({ sceneId, avatarId }, "HeyGen avatar generation started");

    const videoId = await this.submitGeneration(apiKey, publicAudioUrl, publicImageUrl, avatarId);
    const deliveryUrl = await this.pollUntilComplete(apiKey, videoId);
    const s3Url = await this.downloadToS3(deliveryUrl, sceneId);

    logger.info({ sceneId, videoId, s3Url }, "HeyGen avatar generation complete");
    return s3Url;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async submitGeneration(apiKey: string, audioUrl: string, imageUrl: string, avatarId: string): Promise<string> {
    const res = await this.httpFetch(`${BASE_URL}/v2/video/generate`, {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
          voice: { type: "audio", audio_url: audioUrl },
          background: { type: "image", url: imageUrl },
        }],
        dimension: { width: 1280, height: 720 },
      }),
    });

    if (!res.ok) throw new Error(`HeyGen generate error: ${res.status}`);
    const data: any = await res.json();
    return data.data?.video_id as string;
  }

  protected async pollUntilComplete(apiKey: string, videoId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const res = await this.httpFetch(`${BASE_URL}/v1/video_status.get?video_id=${videoId}`, {
        headers: { "X-Api-Key": apiKey },
      });
      if (!res.ok) throw new Error(`HeyGen poll error: ${res.status}`);

      const data: any = await res.json();
      const status: string = data.data?.status ?? "";

      if (status === "completed") return data.data.video_url as string;
      if (status === "failed") throw new Error(`HeyGen video ${videoId} failed: ${data.data?.error ?? "unknown"}`);
    }

    throw new Error(`HeyGen video ${videoId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
  }

  protected async downloadToS3(deliveryUrl: string, sceneId: string): Promise<string> {
    const res = await this.httpFetch(deliveryUrl);
    if (!res.ok) throw new Error(`HeyGen download error: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const key = `avatar/heygen/${sceneId}-${Date.now()}.mp4`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: "video/mp4",
    }));
    return `s3://${this.bucket}/${key}`;
  }

  private toPublicUrl(s3Url: string): string {
    const base = process.env.MINIO_PUBLIC_URL;
    if (!base) return s3Url;
    if (!s3Url.startsWith("s3://")) return s3Url;
    return `${base}/${s3Url.slice("s3://".length)}`;
  }

  private async getApiKey(): Promise<string> {
    if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
    return (await this.settings.getPlaintext("integrations.heygenKey")) ?? "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
