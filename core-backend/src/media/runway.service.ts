import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { VideoCacheService } from "./video-cache.service";

const logger = pino({ level: "info" });

const MODEL_ID = "gen3a_turbo";
const RESOLUTION = "1080p";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;

export const RUNWAY_HTTP = Symbol("RUNWAY_HTTP");

export interface RunwayGenerateParams {
  visualPrompt: string;
}

@Injectable()
export class RunwayService {
  private readonly breaker = new CircuitBreaker("runway", 5, 60_000);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    private readonly cache: VideoCacheService,
    @Inject(RUNWAY_HTTP) private readonly httpFetch: typeof fetch
  ) {
    this.apiKey = process.env.RUNWAY_API_KEY ?? "";
    this.baseUrl = process.env.RUNWAY_BASE_URL ?? "https://api.runwayml.com";
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    });
  }

  /**
   * Generate a video clip via Runway Gen-3 Alpha.
   * Returns an s3:// URL — external Runway CDN URL is never returned to callers.
   */
  async generateVideo(params: RunwayGenerateParams): Promise<string> {
    const cacheKey = this.cache.computeCacheKey(params.visualPrompt, MODEL_ID, RESOLUTION);
    const cached = await this.cache.getCached(cacheKey);
    if (cached) return cached;

    // Submit task + poll — wrapped in circuit breaker (NFR-6.3.1)
    const deliveryUrl = await this.breaker.execute(() =>
      this.submitAndPoll(params.visualPrompt)
    );

    // Download Runway CDN URL to S3 before writing cache (Rule: S3 before Redis)
    const s3Key = `video/${cacheKey}.mp4`;
    const s3Url = await this.downloadToS3(deliveryUrl, s3Key);
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ cacheKey, modelId: MODEL_ID }, "Runway video generated and cached");
    return s3Url;
  }

  private async submitAndPoll(prompt: string): Promise<string> {
    const taskId = await this.submitTask(prompt);
    return this.pollUntilComplete(taskId);
  }

  protected async submitTask(prompt: string): Promise<string> {
    const response = await this.httpFetch(`${this.baseUrl}/v1/text_to_video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        promptText: prompt,
        duration: 5,
        ratio: "1280:768",
      }),
    });

    if (!response.ok) {
      const err: any = new Error(`Runway API error: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();
    return data.id as string;
  }

  /**
   * Non-blocking poll — TASK-10 Rule #3.
   * Sleeps between checks, throws TimeoutError after POLL_TIMEOUT_MS.
   */
  protected async pollUntilComplete(taskId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const response = await this.httpFetch(`${this.baseUrl}/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        const err: any = new Error(`Runway poll error: ${response.status}`);
        err.status = response.status;
        throw err;
      }

      const task: any = await response.json();

      if (task.status === "SUCCEEDED") {
        // task.output is array; first element is the video URL
        return task.output[0] as string;
      }

      if (task.status === "FAILED") {
        throw new Error(`Runway task ${taskId} failed`);
      }
    }

    const err: any = new Error(`Runway polling timeout after ${POLL_TIMEOUT_MS}ms`);
    err.code = "TIMEOUT";
    throw err;
  }

  /**
   * Download external URL to S3 using in-memory buffer (no temp files).
   * Idempotent: same external URL returns cached s3:// URL.
   */
  protected async downloadToS3(externalUrl: string, s3Key: string): Promise<string> {
    const urlHash = this.cache.computeUrlHash(externalUrl);
    const existing = await this.cache.getCachedByUrlHash(urlHash);
    if (existing) return existing;

    const response = await this.httpFetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download from Runway CDN: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: "video/mp4",
      })
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCachedByUrlHash(urlHash, s3Url);
    return s3Url;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
