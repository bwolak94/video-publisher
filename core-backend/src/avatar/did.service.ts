/**
 * DIDService — D-ID Talking Photo / Avatar generation (FEATURE-11).
 *
 * Flow:
 *  1. POST /talks           → receives id
 *  2. Poll GET /talks/{id}  until status === "done"
 *  3. Download result_url, upload to S3, return s3:// URL
 *
 * Scores: quality=4, cost=2, reliability=4, latency=2  → composite 26
 */
import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { SettingsService } from "../settings/settings.service";
import type { AvatarProvider } from "./avatar-provider.interface";

const logger = pino({ level: "info" });

export const DID_HTTP = Symbol("DID_HTTP");

const BASE_URL = "https://api.d-id.com";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000;

@Injectable()
export class DIDService implements AvatarProvider {
  readonly name = "did" as const;
  readonly scores = { quality: 4, cost: 2, reliability: 4, latency: 2 };

  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(DID_HTTP) private readonly httpFetch: typeof fetch,
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

  async generate(params: { audioUrl: string; imageUrl: string; sceneId: string }): Promise<string> {
    const { audioUrl, imageUrl, sceneId } = params;
    const apiKey = await this.getApiKey();

    const publicAudioUrl = this.toPublicUrl(audioUrl);
    const publicImageUrl = this.toPublicUrl(imageUrl);

    logger.info({ sceneId }, "D-ID avatar generation started");

    const talkId = await this.createTalk(apiKey, publicAudioUrl, publicImageUrl);
    const resultUrl = await this.pollUntilDone(apiKey, talkId);
    const s3Url = await this.downloadToS3(resultUrl, sceneId);

    logger.info({ sceneId, talkId, s3Url }, "D-ID avatar generation complete");
    return s3Url;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async createTalk(apiKey: string, audioUrl: string, imageUrl: string): Promise<string> {
    const res = await this.httpFetch(`${BASE_URL}/talks`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_url: imageUrl,
        script: { type: "audio", audio_url: audioUrl },
        config: { result_format: "mp4" },
      }),
    });

    if (!res.ok) throw new Error(`D-ID create talk error: ${res.status}`);
    const data: any = await res.json();
    return data.id as string;
  }

  protected async pollUntilDone(apiKey: string, talkId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const res = await this.httpFetch(`${BASE_URL}/talks/${talkId}`, {
        headers: { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`D-ID poll error: ${res.status}`);

      const data: any = await res.json();
      const status: string = data.status ?? "";

      if (status === "done") return data.result_url as string;
      if (status === "error") throw new Error(`D-ID talk ${talkId} failed: ${data.error?.description ?? "unknown"}`);
    }

    throw new Error(`D-ID talk ${talkId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
  }

  protected async downloadToS3(resultUrl: string, sceneId: string): Promise<string> {
    const res = await this.httpFetch(resultUrl);
    if (!res.ok) throw new Error(`D-ID download error: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const key = `avatar/did/${sceneId}-${Date.now()}.mp4`;
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
    if (process.env.DID_API_KEY) return process.env.DID_API_KEY;
    return (await this.settings.getPlaintext("integrations.didKey")) ?? "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
