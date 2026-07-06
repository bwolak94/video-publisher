/**
 * Wav2LipService — Local lip-sync via ai-backend Python Wav2Lip (FEATURE-11).
 *
 * Proxies to POST /api/avatar/wav2lip on the ai-backend service.
 * No API key required — runs locally using the open-source Wav2Lip model.
 *
 * Scores: quality=3, cost=5, reliability=3, latency=4  → composite 29
 * (Highest composite score — preferred when ai-backend is reachable.)
 */
import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import type { AvatarProvider } from "./avatar-provider.interface";

const logger = pino({ level: "info" });

@Injectable()
export class Wav2LipService implements AvatarProvider {
  readonly name = "wav2lip_local" as const;
  readonly scores = { quality: 3, cost: 5, reliability: 3, latency: 4 };

  private readonly aiBackendUrl: string;
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor() {
    this.aiBackendUrl = process.env.AI_BACKEND_URL ?? "http://localhost:8000";
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.aiBackendUrl}/api/avatar/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(params: { audioUrl: string; imageUrl: string; sceneId: string }): Promise<string> {
    const { audioUrl, imageUrl, sceneId } = params;

    logger.info({ sceneId }, "Wav2Lip avatar generation started");

    const res = await fetch(`${this.aiBackendUrl}/api/avatar/wav2lip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl, image_url: imageUrl }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Wav2Lip request failed: ${res.status} — ${body}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const key = `avatar/wav2lip/${sceneId}-${Date.now()}.mp4`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: "video/mp4",
    }));

    const s3Url = `s3://${this.bucket}/${key}`;
    logger.info({ sceneId, s3Url }, "Wav2Lip avatar generation complete");
    return s3Url;
  }
}
