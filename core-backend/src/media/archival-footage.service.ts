import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { VideoCacheService } from "./video-cache.service";
import { extractKeywords } from "./keyword-extractor";
import { SettingsService } from "../settings/settings.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";

const logger = pino({ level: "info" });

const MODEL_ID = "archival";
const RESOLUTION = "720p";

export const ARCHIVAL_HTTP = Symbol("ARCHIVAL_HTTP");

interface ArchivalResult {
  title: string;
  downloadUrl: string;
  source: "archive.org" | "wikimedia" | "nasa";
}

/**
 * Free archival footage provider (FEATURE-01).
 * Searches Archive.org, Wikimedia Commons, and NASA in parallel.
 * No API key required — completely free.
 */
@Injectable()
export class ArchivalFootageService implements VideoProvider {
  readonly name = "archival";

  readonly scores: ProviderScores = {
    quality: 3,
    cost: 5,       // completely free
    reliability: 3,
    latency: 4,    // fast search, just a web request
  };

  private readonly archiveBreaker = new CircuitBreaker("archive.org", 3, 60_000);
  private readonly wikiBreaker = new CircuitBreaker("wikimedia", 3, 60_000);
  private readonly nasaBreaker = new CircuitBreaker("nasa", 3, 60_000);

  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly cache: VideoCacheService,
    @Inject(ARCHIVAL_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async isAvailable(): Promise<boolean> {
    // No key needed — check if user hasn't explicitly disabled it
    const disabled = await this.settings.getPlaintext("integrations.archivalEnabled");
    return disabled !== "false";
  }

  async generate(params: VideoGenerateParams): Promise<string> {
    const { visualPrompt, sceneId } = params;
    const cacheKey = this.cache.computeCacheKey(visualPrompt, MODEL_ID, RESOLUTION);
    const cached = await this.cache.getCached(cacheKey);
    if (cached) {
      logger.info({ cacheKey, sceneId }, "Archival footage cache hit");
      return cached;
    }

    const keywords = extractKeywords(visualPrompt);
    if (!keywords) throw new Error("No keywords extracted from visual prompt");

    const result = await this.searchAllSources(keywords);
    if (!result) throw new Error(`No archival footage found for: "${keywords}"`);

    const s3Key = `video/${cacheKey}.mp4`;
    const s3Url = await this.downloadToS3(result.downloadUrl, s3Key);
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ sceneId, source: result.source, title: result.title, cacheKey }, "Archival footage downloaded and cached");
    return s3Url;
  }

  private async searchAllSources(keywords: string): Promise<ArchivalResult | null> {
    const searches = await Promise.allSettled([
      this.searchArchiveOrg(keywords),
      this.searchWikimedia(keywords),
      this.searchNasa(keywords),
    ]);

    for (const result of searches) {
      if (result.status === "fulfilled" && result.value) return result.value;
    }
    return null;
  }

  /** Archive.org full-text video search */
  protected async searchArchiveOrg(keywords: string): Promise<ArchivalResult | null> {
    return this.archiveBreaker.execute(async () => {
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(keywords)}&fl[]=identifier,title&rows=5&output=json&mediatype=movies`;
      const res = await this.httpFetch(url, {
        headers: { "User-Agent": "AI-Video-Factory/1.0 (archival footage search)" },
      });
      if (!res.ok) throw new Error(`Archive.org search error: ${res.status}`);

      const data: any = await res.json();
      const docs: any[] = data?.response?.docs ?? [];
      if (!docs.length) return null;

      // Find the first item with a downloadable MP4
      for (const doc of docs) {
        const downloadUrl = await this.getArchiveOrgMp4(doc.identifier).catch(() => null);
        if (downloadUrl) {
          return { title: doc.title ?? doc.identifier, downloadUrl, source: "archive.org" };
        }
      }
      return null;
    });
  }

  private async getArchiveOrgMp4(identifier: string): Promise<string | null> {
    const res = await this.httpFetch(`https://archive.org/metadata/${identifier}/files`);
    if (!res.ok) return null;
    const data: any = await res.json();
    const files: any[] = data?.result ?? [];
    const mp4 = files.find((f) => f.format === "MPEG4" || f.name?.endsWith(".mp4"));
    if (!mp4) return null;
    return `https://archive.org/download/${identifier}/${mp4.name}`;
  }

  /** Wikimedia Commons video search */
  protected async searchWikimedia(keywords: string): Promise<ArchivalResult | null> {
    return this.wikiBreaker.execute(async () => {
      const params = new URLSearchParams({
        action: "query",
        list: "search",
        srnamespace: "6",
        srsearch: `${keywords} filetype:video`,
        srlimit: "5",
        format: "json",
        origin: "*",
      });
      const res = await this.httpFetch(`https://commons.wikimedia.org/w/api.php?${params}`);
      if (!res.ok) throw new Error(`Wikimedia search error: ${res.status}`);

      const data: any = await res.json();
      const results: any[] = data?.query?.search ?? [];
      if (!results.length) return null;

      for (const item of results) {
        const title: string = item.title ?? "";
        if (!title.match(/\.(mp4|webm|ogv)$/i)) continue;

        const fileParams = new URLSearchParams({
          action: "query",
          titles: title,
          prop: "videoinfo",
          viprop: "url",
          format: "json",
          origin: "*",
        });
        const fileRes = await this.httpFetch(`https://commons.wikimedia.org/w/api.php?${fileParams}`);
        if (!fileRes.ok) continue;

        const fileData: any = await fileRes.json();
        const pages = Object.values(fileData?.query?.pages ?? {}) as any[];
        const videoUrl = pages[0]?.videoinfo?.[0]?.url;
        if (videoUrl) {
          return { title, downloadUrl: videoUrl, source: "wikimedia" };
        }
      }
      return null;
    });
  }

  /** NASA Image and Video Library search */
  protected async searchNasa(keywords: string): Promise<ArchivalResult | null> {
    return this.nasaBreaker.execute(async () => {
      const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(keywords)}&media_type=video`;
      const res = await this.httpFetch(url);
      if (!res.ok) throw new Error(`NASA API error: ${res.status}`);

      const data: any = await res.json();
      const items: any[] = data?.collection?.items ?? [];
      if (!items.length) return null;

      for (const item of items) {
        const assetUrl = item?.href;
        if (!assetUrl) continue;

        const assetRes = await this.httpFetch(assetUrl);
        if (!assetRes.ok) continue;

        const assets: string[] = await assetRes.json();
        const mp4 = assets.find((a) => a.endsWith("~mobile.mp4") || a.endsWith(".mp4"));
        if (mp4) {
          return {
            title: item?.data?.[0]?.title ?? "NASA Video",
            downloadUrl: mp4,
            source: "nasa",
          };
        }
      }
      return null;
    });
  }

  protected async downloadToS3(externalUrl: string, s3Key: string): Promise<string> {
    const urlHash = this.cache.computeUrlHash(externalUrl);
    const existing = await this.cache.getCachedByUrlHash(urlHash);
    if (existing) return existing;

    const response = await this.httpFetch(externalUrl, {
      headers: { "User-Agent": "AI-Video-Factory/1.0" },
    });
    if (!response.ok) throw new Error(`Failed to download archival footage: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "video/mp4";

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    }));

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCachedByUrlHash(urlHash, s3Url);
    return s3Url;
  }
}
