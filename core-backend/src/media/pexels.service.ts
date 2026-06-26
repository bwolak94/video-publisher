import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { VideoCacheService } from "./video-cache.service";
import { extractKeywords } from "./keyword-extractor";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

const MODEL_ID = "pexels";
const RESOLUTION = "1080p";

export const PEXELS_HTTP = Symbol("PEXELS_HTTP");

interface PexelsVideoFile {
  width: number;
  height: number;
  link: string;
  quality: string;
}

@Injectable()
export class PexelsService {
  private readonly breaker = new CircuitBreaker("pexels", 5, 60_000);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor(
    private readonly cache: VideoCacheService,
    @Inject(PEXELS_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService
  ) {
    this.baseUrl = process.env.PEXELS_BASE_URL ?? "https://api.pexels.com";
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    });
  }

  private async getApiKey(): Promise<string> {
    if (process.env.PEXELS_API_KEY) return process.env.PEXELS_API_KEY;
    return (await this.settings.getPlaintext("integrations.pexelsKey")) ?? "";
  }

  /**
   * Search Pexels for stock footage matching the visual prompt, then download to S3.
   * Orientation is derived from aspect ratio (TASK-10 Rule #5).
   */
  async searchAndDownload(
    visualPrompt: string,
    aspectRatio: "16:9" | "9:16" = "16:9"
  ): Promise<string> {
    const cacheKey = this.cache.computeCacheKey(visualPrompt, MODEL_ID, RESOLUTION);
    const cached = await this.cache.getCached(cacheKey);
    if (cached) return cached;

    const keywords = extractKeywords(visualPrompt);
    if (!keywords) throw new Error("No keywords extracted from visual prompt");

    const orientation: "portrait" | "landscape" =
      aspectRatio === "9:16" ? "portrait" : "landscape";

    const videoDownloadUrl = await this.breaker.execute(() =>
      this.searchVideo(keywords, orientation)
    );

    const s3Key = `video/${cacheKey}.mp4`;
    const s3Url = await this.downloadToS3(videoDownloadUrl, s3Key);
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ cacheKey, keywords, orientation }, "Pexels video downloaded and cached");
    return s3Url;
  }

  protected async searchVideo(
    keywords: string,
    orientation: "portrait" | "landscape"
  ): Promise<string> {
    const url = `${this.baseUrl}/v1/videos/search?query=${encodeURIComponent(keywords)}&per_page=5&orientation=${orientation}`;

    const response = await this.httpFetch(url, {
      headers: { Authorization: await this.getApiKey() },
    });

    if (!response.ok) {
      const err: any = new Error(`Pexels API error: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();

    if (!data.videos?.length) {
      throw new Error(`No Pexels results for keywords: "${keywords}"`);
    }

    const video = data.videos[0];
    const file = this.selectBestFile(video.video_files, orientation);
    return file.link;
  }

  /**
   * Prefer 1080p; filter by orientation before selecting quality.
   */
  private selectBestFile(
    files: PexelsVideoFile[],
    orientation: "portrait" | "landscape"
  ): PexelsVideoFile {
    const oriented = files.filter((f) =>
      orientation === "portrait" ? f.height > f.width : f.width > f.height
    );
    const pool = oriented.length ? oriented : files;

    const hd = pool.find((f) => f.quality === "hd" || f.height === 1080 || f.width === 1920);
    return hd ?? pool[0];
  }

  /**
   * Download external URL to S3 without temp files. Idempotent by URL hash.
   */
  protected async downloadToS3(externalUrl: string, s3Key: string): Promise<string> {
    const urlHash = this.cache.computeUrlHash(externalUrl);
    const existing = await this.cache.getCachedByUrlHash(urlHash);
    if (existing) return existing;

    const response = await this.httpFetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Pexels video: ${response.status}`);
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
}
