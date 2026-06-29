/**
 * Free Archival Footage Provider (FEATURE-02).
 *
 * Searches Archive.org, Wikimedia Commons, and NASA in parallel.
 * Results are semantically ranked against the scene's visualPrompt,
 * cached in DB for 7 days, and uploaded to S3 via streaming (no RAM buffering).
 * No API key required.
 */

import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import * as crypto from "crypto";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { VideoCacheService } from "./video-cache.service";
import { ArchivalFootageCacheService } from "./archival-footage-db-cache.service";
import { rankResults } from "./archival-semantic-ranker";
import { extractKeywords } from "./keyword-extractor";
import { SettingsService } from "../settings/settings.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";
import type { ArchivalFootageResult, ArchivalSearchParams, ArchivalSource } from "./archival-footage.types";

const logger = pino({ level: "info" });

const MODEL_ID = "archival";
const RESOLUTION = "720p";
const ALL_SOURCES: ArchivalSource[] = ["archive.org", "wikimedia", "nasa"];
const DEFAULT_MIN_DURATION_SECONDS = 3;

export const ARCHIVAL_HTTP = Symbol("ARCHIVAL_HTTP");

@Injectable()
export class ArchivalFootageService implements VideoProvider {
  readonly name = "archival";

  readonly scores: ProviderScores = {
    quality: 3,
    cost: 5,       // completely free
    reliability: 3,
    latency: 4,
  };

  private readonly archiveBreaker = new CircuitBreaker("archive.org", 3, 60_000);
  private readonly wikiBreaker = new CircuitBreaker("wikimedia", 3, 60_000);
  private readonly nasaBreaker = new CircuitBreaker("nasa", 3, 60_000);

  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly cache: VideoCacheService,
    private readonly dbCache: ArchivalFootageCacheService,
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
    const disabled = await this.settings.getPlaintext("integrations.archivalEnabled");
    return disabled !== "false";
  }

  // ── VideoProvider.generate ─────────────────────────────────────────────────

  async generate(params: VideoGenerateParams): Promise<string> {
    const { visualPrompt, sceneId } = params;

    // 1. Redis content-hash cache (fastest path)
    const redisCacheKey = this.cache.computeCacheKey(visualPrompt, MODEL_ID, RESOLUTION);
    const redisCached = await this.cache.getCached(redisCacheKey);
    if (redisCached) {
      logger.info({ cacheKey: redisCacheKey, sceneId }, "Archival footage Redis cache hit");
      return redisCached;
    }

    // 2. DB search-result cache (avoids repeating all 3 API calls)
    const sources = ALL_SOURCES;
    const dbHash = this.dbCache.computeHash(visualPrompt, sources);
    const dbCached = await this.dbCache.get(dbHash);
    if (dbCached?.s3Url) {
      logger.info({ dbHash, s3Url: dbCached.s3Url, sceneId }, "Archival footage DB cache hit (with s3Url)");
      await this.cache.setCached(redisCacheKey, dbCached.s3Url);
      return dbCached.s3Url;
    }

    // 3. Search all sources and rank
    const searchParams: ArchivalSearchParams = {
      visualPrompt,
      minDurationSeconds: DEFAULT_MIN_DURATION_SECONDS,
    };

    const ranked = await this.search(searchParams);
    if (ranked.length === 0) {
      throw new Error(`No archival footage found for: "${visualPrompt}"`);
    }

    // Persist ranked results regardless of download success
    await this.dbCache.save(dbHash, ranked);

    // 4. Download best result to S3 (streaming)
    const best = ranked[0];
    const s3Key = `video/${redisCacheKey}.mp4`;
    const s3Url = await this.downloadToS3(best.downloadUrl, s3Key);

    // 5. Write back to both caches
    await this.cache.setCached(redisCacheKey, s3Url);
    await this.dbCache.updateS3Url(dbHash, s3Url);

    logger.info(
      { sceneId, source: best.source, title: best.title, relevanceScore: best.relevanceScore, s3Url },
      "Archival footage downloaded and cached"
    );
    return s3Url;
  }

  // ── Public search API ──────────────────────────────────────────────────────

  /**
   * Search all (or specified) sources and return ranked results.
   * Applies duration filters and semantic ranking.
   */
  async search(params: ArchivalSearchParams): Promise<ArchivalFootageResult[]> {
    const {
      visualPrompt,
      minDurationSeconds = DEFAULT_MIN_DURATION_SECONDS,
      maxDurationSeconds,
      sources = ALL_SOURCES,
    } = params;

    const keywords = extractKeywords(visualPrompt);
    if (!keywords) return [];

    const rawResults = await this.searchAllSources(keywords, sources);

    const filtered = rawResults.filter((r) => {
      if (r.durationSeconds > 0 && r.durationSeconds < minDurationSeconds) return false;
      if (maxDurationSeconds && r.durationSeconds > 0 && r.durationSeconds > maxDurationSeconds) return false;
      return true;
    });

    return rankResults(filtered, visualPrompt);
  }

  // ── Internal search orchestration ─────────────────────────────────────────

  private async searchAllSources(
    keywords: string,
    sources: ArchivalSource[]
  ): Promise<ArchivalFootageResult[]> {
    const tasks: Promise<ArchivalFootageResult[]>[] = [];
    if (sources.includes("archive.org")) tasks.push(this.searchArchiveOrg(keywords));
    if (sources.includes("wikimedia"))   tasks.push(this.searchWikimedia(keywords));
    if (sources.includes("nasa"))        tasks.push(this.searchNasa(keywords));

    const settled = await Promise.allSettled(tasks);
    const all: ArchivalFootageResult[] = [];

    for (const r of settled) {
      if (r.status === "fulfilled") all.push(...r.value);
      else logger.warn({ reason: r.reason?.message }, "Archival source search failed");
    }
    return all;
  }

  // ── Archive.org ────────────────────────────────────────────────────────────

  protected async searchArchiveOrg(keywords: string): Promise<ArchivalFootageResult[]> {
    return this.archiveBreaker.execute(async () => {
      const url =
        `https://archive.org/advancedsearch.php?` +
        `q=${encodeURIComponent(keywords)}&fl[]=identifier,title&rows=8&output=json&mediatype=movies`;

      const res = await this.httpFetch(url, {
        headers: { "User-Agent": "AI-Video-Factory/1.0 (archival footage search)" },
      });
      if (!res.ok) throw new Error(`Archive.org search error: ${res.status}`);

      const data: any = await res.json();
      const docs: any[] = data?.response?.docs ?? [];
      if (!docs.length) return [];

      const results: ArchivalFootageResult[] = [];
      for (const doc of docs) {
        const item = await this.fetchArchiveOrgItem(doc.identifier).catch(() => null);
        if (item) results.push(item);
      }
      return results;
    }).catch(() => []);
  }

  private async fetchArchiveOrgItem(identifier: string): Promise<ArchivalFootageResult | null> {
    const res = await this.httpFetch(`https://archive.org/metadata/${identifier}/files`);
    if (!res.ok) return null;

    const data: any = await res.json();
    const files: any[] = data?.result ?? [];

    const mp4 = files.find((f) => f.format === "MPEG4" || f.name?.endsWith(".mp4"));
    if (!mp4) return null;

    const downloadUrl = `https://archive.org/download/${identifier}/${mp4.name}`;
    const duration = parseFloat(mp4.length ?? "0") || 0;
    const width = parseInt(mp4.width ?? "0", 10) || 0;
    const height = parseInt(mp4.height ?? "0", 10) || 0;

    return {
      source: "archive.org",
      identifier,
      title: mp4.title ?? identifier,
      downloadUrl,
      format: "mp4",
      durationSeconds: duration,
      width,
      height,
      license: "Public Domain",
      relevanceScore: 0,
    };
  }

  // ── Wikimedia Commons ──────────────────────────────────────────────────────

  protected async searchWikimedia(keywords: string): Promise<ArchivalFootageResult[]> {
    return this.wikiBreaker.execute(async () => {
      const searchParams = new URLSearchParams({
        action: "query",
        list: "search",
        srnamespace: "6",
        srsearch: `${keywords} filetype:video`,
        srlimit: "8",
        format: "json",
        origin: "*",
      });

      const res = await this.httpFetch(`https://commons.wikimedia.org/w/api.php?${searchParams}`);
      if (!res.ok) throw new Error(`Wikimedia search error: ${res.status}`);

      const data: any = await res.json();
      const items: any[] = data?.query?.search ?? [];
      if (!items.length) return [];

      const results: ArchivalFootageResult[] = [];
      for (const item of items) {
        const title: string = item.title ?? "";
        if (!title.match(/\.(mp4|webm|ogv)$/i)) continue;

        const result = await this.fetchWikimediaFileInfo(title).catch(() => null);
        if (result) results.push(result);
      }
      return results;
    }).catch(() => []);
  }

  private async fetchWikimediaFileInfo(fileTitle: string): Promise<ArchivalFootageResult | null> {
    const fileParams = new URLSearchParams({
      action: "query",
      titles: fileTitle,
      prop: "videoinfo|imageinfo",
      viprop: "url|size|mediatype|extmetadata",
      iiprop: "url|size|extmetadata",
      format: "json",
      origin: "*",
    });

    const res = await this.httpFetch(`https://commons.wikimedia.org/w/api.php?${fileParams}`);
    if (!res.ok) return null;

    const fileData: any = await res.json();
    const pages = Object.values(fileData?.query?.pages ?? {}) as any[];
    const page = pages[0];
    const info = page?.videoinfo?.[0] ?? page?.imageinfo?.[0];
    if (!info?.url) return null;

    const ext = fileTitle.split(".").pop()?.toLowerCase() ?? "mp4";
    const format = (["mp4", "webm", "ogv", "mov"].includes(ext) ? ext : "mp4") as ArchivalFootageResult["format"];

    const license =
      info.extmetadata?.LicenseShortName?.value ??
      info.extmetadata?.License?.value ??
      "CC BY-SA 4.0";

    return {
      source: "wikimedia",
      identifier: fileTitle,
      title: page.title ?? fileTitle,
      downloadUrl: info.url,
      format,
      durationSeconds: info.duration ?? 0,
      width: info.width ?? 0,
      height: info.height ?? 0,
      license,
      relevanceScore: 0,
    };
  }

  // ── NASA Image and Video Library ───────────────────────────────────────────

  protected async searchNasa(keywords: string): Promise<ArchivalFootageResult[]> {
    return this.nasaBreaker.execute(async () => {
      const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(keywords)}&media_type=video`;
      const res = await this.httpFetch(url);
      if (!res.ok) throw new Error(`NASA API error: ${res.status}`);

      const data: any = await res.json();
      const items: any[] = (data?.collection?.items ?? []).slice(0, 8);
      if (!items.length) return [];

      const results: ArchivalFootageResult[] = [];
      for (const item of items) {
        const result = await this.fetchNasaAsset(item).catch(() => null);
        if (result) results.push(result);
      }
      return results;
    }).catch(() => []);
  }

  private async fetchNasaAsset(item: any): Promise<ArchivalFootageResult | null> {
    const assetUrl: string = item?.href;
    if (!assetUrl) return null;

    const assetRes = await this.httpFetch(assetUrl);
    if (!assetRes.ok) return null;

    const assets: string[] = await assetRes.json();
    const mp4 = assets.find((a) => a.endsWith("~mobile.mp4") || a.endsWith(".mp4"));
    if (!mp4) return null;

    return {
      source: "nasa",
      identifier: item?.data?.[0]?.nasa_id ?? assetUrl,
      title: item?.data?.[0]?.title ?? "NASA Video",
      downloadUrl: mp4,
      format: "mp4",
      durationSeconds: 0,  // NASA manifest doesn't include duration
      width: 0,
      height: 0,
      license: "Public Domain (NASA)",
      relevanceScore: 0,
    };
  }

  // ── S3 streaming upload ────────────────────────────────────────────────────

  protected async downloadToS3(externalUrl: string, s3Key: string): Promise<string> {
    // Idempotent: don't re-download the same source URL
    const urlHash = this.cache.computeUrlHash(externalUrl);
    const existing = await this.cache.getCachedByUrlHash(urlHash);
    if (existing) return existing;

    const response = await this.httpFetch(externalUrl, {
      headers: { "User-Agent": "AI-Video-Factory/1.0" },
    });
    if (!response.ok) throw new Error(`Failed to download archival footage: ${response.status}`);
    if (!response.body) throw new Error("Download response has no body");

    // Stream directly to S3 — no full-video RAM buffering
    const nodeStream = Readable.fromWeb(response.body as any);
    const contentType = response.headers.get("content-type") ?? "video/mp4";

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: nodeStream,
        ContentType: contentType,
      })
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCachedByUrlHash(urlHash, s3Url);
    logger.info({ externalUrl, s3Url }, "Archival footage streamed to S3");
    return s3Url;
  }
}
