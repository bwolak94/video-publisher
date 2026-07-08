import { Injectable } from "@nestjs/common";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import type { VideoPublisher, PublishOptions, PublishResult } from "../video-publisher.interface";
import { SettingsService } from "../../settings/settings.service";

const logger = pino({ level: "info" });

const TIKTOK_BASE_URL = "https://open.tiktokapis.com";
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks (TikTok max is 64 MB)
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000; // 5 min

/**
 * TikTok Content Posting API v2 publisher.
 *
 * Auth: long-lived user access token stored in Settings → Integrations → tiktokAccessToken
 *       Obtain via TikTok Developer Portal → Login Kit → Creator Authorization
 *       Required scopes: video.upload, video.publish
 *
 * Flow:
 *   1. POST /v2/post/publish/video/init/   → upload_url + publish_id
 *   2. PUT  upload_url  with chunked video bytes from S3
 *   3. POST /v2/post/publish/status/fetch/ until status === "PUBLISH_COMPLETE"
 */
@Injectable()
export class TikTokPublisher implements VideoPublisher {
  readonly platform = "tiktok" as const;

  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly settings: SettingsService) {
    this.bucket =
      process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "eu-central-1",
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }

  async upload(options: PublishOptions): Promise<PublishResult> {
    const accessToken = await this.getAccessToken();

    logger.info({ projectId: options.projectId }, "Starting TikTok upload");

    // Download video from S3 into memory
    const videoBuffer = await this.downloadFromS3(options.s3Key);
    const videoSize = videoBuffer.byteLength;
    const chunkCount = Math.ceil(videoSize / CHUNK_SIZE);

    // Step 1 — initialise upload and obtain upload_url + publish_id
    const { uploadUrl, publishId } = await this.initUpload(accessToken, {
      title: options.title.slice(0, 150), // TikTok title max 150 chars
      privacyLevel:
        options.privacyStatus === "public" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY",
      videoSize,
      chunkSize: Math.min(CHUNK_SIZE, videoSize),
      totalChunkCount: chunkCount,
    });

    logger.info({ projectId: options.projectId, publishId, chunkCount }, "TikTok upload initialised");

    // Step 2 — upload video in chunks
    await this.uploadChunks(uploadUrl, videoBuffer, chunkCount);

    logger.info({ projectId: options.projectId, publishId }, "TikTok video chunks uploaded — polling status");

    // Step 3 — poll until TikTok finishes processing
    const videoId = await this.pollPublishStatus(accessToken, publishId);

    logger.info({ projectId: options.projectId, publishId, videoId }, "TikTok upload complete");

    return {
      platform: "tiktok",
      platformVideoId: publishId,
      url: videoId ? `https://www.tiktok.com/@me/video/${videoId}` : undefined,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async initUpload(
    accessToken: string,
    params: {
      title: string;
      privacyLevel: string;
      videoSize: number;
      chunkSize: number;
      totalChunkCount: number;
    },
  ): Promise<{ uploadUrl: string; publishId: string }> {
    const response = await fetch(`${TIKTOK_BASE_URL}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: params.title,
          privacy_level: params.privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: params.videoSize,
          chunk_size: params.chunkSize,
          total_chunk_count: params.totalChunkCount,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`TikTok init upload failed: HTTP ${response.status} — ${body}`);
    }

    const data: any = await response.json();
    if (data.error?.code && data.error.code !== "ok") {
      throw new Error(`TikTok init upload error: ${data.error.message} (${data.error.code})`);
    }

    return {
      uploadUrl: data.data.upload_url as string,
      publishId: data.data.publish_id as string,
    };
  }

  private async uploadChunks(
    uploadUrl: string,
    buffer: Buffer,
    totalChunks: number,
  ): Promise<void> {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
      const chunk = buffer.subarray(start, end);

      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${buffer.byteLength}`,
          "Content-Length": String(chunk.byteLength),
          "Content-Type": "video/mp4",
        },
        body: chunk as unknown as BodyInit,
      });

      // 206 Partial Content is a success response for intermediate chunks
      if (!response.ok && response.status !== 206) {
        throw new Error(
          `TikTok chunk ${i + 1}/${totalChunks} upload failed: HTTP ${response.status}`,
        );
      }

      logger.debug({ chunk: i + 1, totalChunks }, "TikTok chunk uploaded");
    }
  }

  private async pollPublishStatus(
    accessToken: string,
    publishId: string,
  ): Promise<string | null> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const response = await fetch(`${TIKTOK_BASE_URL}/v2/post/publish/status/fetch/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`TikTok status poll failed: HTTP ${response.status} — ${body}`);
      }

      const data: any = await response.json();
      if (data.error?.code && data.error.code !== "ok") {
        throw new Error(`TikTok status poll error: ${data.error.message}`);
      }

      const status = data.data?.status as string | undefined;
      // publicly_available_post_id is an array; first element is the video id
      const videoId = (data.data?.publicly_available_post_id as string[] | undefined)?.[0] ?? null;

      logger.debug({ publishId, status }, "TikTok publish status");

      if (status === "PUBLISH_COMPLETE") return videoId;

      if (status === "FAILED") {
        const reason = (data.data?.fail_reason as string | undefined) ?? "unknown";
        throw new Error(`TikTok publish failed: ${reason}`);
      }
    }

    throw new Error(
      `TikTok publish timeout after ${POLL_TIMEOUT_MS / 1000}s (publishId=${publishId})`,
    );
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

  private async getAccessToken(): Promise<string> {
    if (process.env.TIKTOK_ACCESS_TOKEN) return process.env.TIKTOK_ACCESS_TOKEN;
    const token = await this.settings.getPlaintext("integrations.tiktokAccessToken");
    if (!token) {
      throw new Error(
        "TikTok access token not configured. Add integrations.tiktokAccessToken in Settings.",
      );
    }
    return token;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
