import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { VideoCacheService } from "./video-cache.service";
import { SettingsService } from "../settings/settings.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";

const logger = pino({ level: "info" });

const MODEL_ID = "kling-v1";
const RESOLUTION = "1080p";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 180_000; // Kling can be slower than Runway

export const KLING_HTTP = Symbol("KLING_HTTP");

/**
 * Kling AI text-to-video provider (FEATURE-01).
 *
 * Auth: HMAC-JWT from access_key + secret_key
 * Endpoint: https://api.klingai.com/v1/videos/text2video
 * Docs: platform.klingai.com/docs
 */
@Injectable()
export class KlingService implements VideoProvider {
  readonly name = "kling";

  readonly scores: ProviderScores = {
    quality: 5,
    cost: 2,       // paid but cheaper than Runway per clip
    reliability: 4,
    latency: 3,    // ~60s average
  };

  private readonly breaker = new CircuitBreaker("kling", 5, 60_000);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor(
    private readonly cache: VideoCacheService,
    @Inject(KLING_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.baseUrl = process.env.KLING_BASE_URL ?? "https://api.klingai.com";
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async isAvailable(): Promise<boolean> {
    const accessKey = await this.getAccessKey();
    const secretKey = await this.getSecretKey();
    return !!(accessKey && secretKey);
  }

  async generate(params: VideoGenerateParams): Promise<string> {
    const { visualPrompt, aspectRatio = "16:9", sceneId } = params;
    const cacheKey = this.cache.computeCacheKey(visualPrompt, MODEL_ID, RESOLUTION);
    const cached = await this.cache.getCached(cacheKey);
    if (cached) {
      logger.info({ cacheKey, sceneId }, "Kling cache hit");
      return cached;
    }

    const deliveryUrl = await this.breaker.execute(() =>
      this.submitAndPoll(visualPrompt, aspectRatio)
    );

    const s3Key = `video/${cacheKey}.mp4`;
    const s3Url = await this.downloadToS3(deliveryUrl, s3Key);
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ cacheKey, sceneId, modelId: MODEL_ID }, "Kling video generated and cached");
    return s3Url;
  }

  private async submitAndPoll(prompt: string, aspectRatio: "16:9" | "9:16"): Promise<string> {
    const taskId = await this.submitTask(prompt, aspectRatio);
    return this.pollUntilComplete(taskId);
  }

  protected async submitTask(prompt: string, aspectRatio: "16:9" | "9:16"): Promise<string> {
    const jwt = await this.buildJwt();
    const response = await this.httpFetch(`${this.baseUrl}/v1/videos/text2video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_name: MODEL_ID,
        prompt,
        duration: "5",
        aspect_ratio: aspectRatio,
        cfg_scale: 0.5,
        mode: "std",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err: any = new Error(`Kling API error: ${response.status} ${body}`);
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();
    if (data.code !== 0) {
      throw new Error(`Kling task submission failed: ${data.message}`);
    }
    return data.data.task_id as string;
  }

  protected async pollUntilComplete(taskId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const jwt = await this.buildJwt();
      const response = await this.httpFetch(`${this.baseUrl}/v1/videos/text2video/${taskId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!response.ok) {
        const err: any = new Error(`Kling poll error: ${response.status}`);
        err.status = response.status;
        throw err;
      }

      const body: any = await response.json();
      const task = body.data;

      if (task.task_status === "succeed") {
        const videoUrl = task.task_result?.videos?.[0]?.url;
        if (!videoUrl) throw new Error("Kling task succeeded but no video URL in response");
        return videoUrl as string;
      }

      if (task.task_status === "failed") {
        throw new Error(`Kling task ${taskId} failed: ${task.task_status_msg ?? "unknown"}`);
      }

      logger.debug({ taskId, status: task.task_status }, "Kling task still processing");
    }

    const err: any = new Error(`Kling polling timeout after ${POLL_TIMEOUT_MS}ms`);
    err.code = "TIMEOUT";
    throw err;
  }

  protected async downloadToS3(externalUrl: string, s3Key: string): Promise<string> {
    const urlHash = this.cache.computeUrlHash(externalUrl);
    const existing = await this.cache.getCachedByUrlHash(urlHash);
    if (existing) return existing;

    const response = await this.httpFetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Kling video: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: "video/mp4",
    }));

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCachedByUrlHash(urlHash, s3Url);
    return s3Url;
  }

  /**
   * Build a short-lived JWT for Kling API authentication.
   * Header: { alg: "HS256", typ: "JWT" }
   * Payload: { iss: ACCESS_KEY, exp: now+1800, nbf: now-5 }
   * Signed with SECRET_KEY using HMAC-SHA256
   */
  private async buildJwt(): Promise<string> {
    const accessKey = await this.getAccessKey();
    const secretKey = await this.getSecretKey();

    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: nowSec + 1800, nbf: nowSec - 5 })).toString("base64url");
    const data = `${header}.${payload}`;
    const sig = crypto.createHmac("sha256", secretKey).update(data).digest("base64url");
    return `${data}.${sig}`;
  }

  private async getAccessKey(): Promise<string> {
    if (process.env.KLING_ACCESS_KEY) return process.env.KLING_ACCESS_KEY;
    return (await this.settings.getPlaintext("integrations.klingAccessKey")) ?? "";
  }

  private async getSecretKey(): Promise<string> {
    if (process.env.KLING_SECRET_KEY) return process.env.KLING_SECRET_KEY;
    return (await this.settings.getPlaintext("integrations.klingSecretKey")) ?? "";
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
