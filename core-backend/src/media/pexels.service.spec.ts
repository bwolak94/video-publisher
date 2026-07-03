/**
 * Unit tests for PexelsService — UT-10-07, UT-10-08, UT-10-09
 */
import * as fs from "fs";
import { Test } from "@nestjs/testing";
import { PexelsService, PEXELS_HTTP } from "./pexels.service";
import { VideoCacheService } from "./video-cache.service";
import { SettingsService } from "../settings/settings.service";

const settingsMock = { getPlaintext: jest.fn().mockResolvedValue(null) };

const CACHE_KEY = "pexcache123";
const PEXELS_CDN_URL = "https://videos.pexels.com/video-files/1234/portrait.mp4";
const S3_URL = `s3://test-bucket/video/${CACHE_KEY}.mp4`;
const VISUAL_PROMPT = "Stock market graph falling rapidly on screen";

function makeCacheMock(cachedUrl: string | null = null) {
  return {
    computeCacheKey: jest.fn().mockReturnValue(CACHE_KEY),
    getCached: jest.fn().mockResolvedValue(cachedUrl),
    setCached: jest.fn().mockResolvedValue(undefined),
    computeUrlHash: jest.fn().mockReturnValue("urlhash456"),
    getCachedByUrlHash: jest.fn().mockResolvedValue(null),
    setCachedByUrlHash: jest.fn().mockResolvedValue(undefined),
  };
}

function makePexelsVideoResponse(orientation: "portrait" | "landscape") {
  const isPortrait = orientation === "portrait";
  return {
    videos: [
      {
        video_files: [
          { width: isPortrait ? 720 : 1920, height: isPortrait ? 1280 : 1080, link: PEXELS_CDN_URL, quality: "hd" },
          { width: isPortrait ? 360 : 1280, height: isPortrait ? 640 : 720, link: "https://videos.pexels.com/sd.mp4", quality: "sd" },
        ],
      },
    ],
    total_results: 1,
  };
}

async function buildService(cacheMock: any, mockFetch: jest.Mock) {
  const module = await Test.createTestingModule({
    providers: [
      PexelsService,
      { provide: VideoCacheService, useValue: cacheMock },
      { provide: PEXELS_HTTP, useValue: mockFetch },
      { provide: SettingsService, useValue: settingsMock },
    ],
  }).compile();

  return module.get(PexelsService);
}

describe("PexelsService", () => {
  it("cache hit returns S3 URL without calling Pexels API", async () => {
    const cache = makeCacheMock(S3_URL);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    const url = await svc.searchAndDownload(VISUAL_PROMPT, "16:9");
    expect(url).toBe(S3_URL);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // UT-10-07: 9:16 storyboard → portrait orientation in Pexels search
  it("UT-10-07: 9:16 aspect ratio → portrait orientation used in search", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    jest.spyOn(svc as any, "searchVideo").mockResolvedValue(PEXELS_CDN_URL);
    jest.spyOn(svc as any, "downloadToS3").mockResolvedValue(S3_URL);

    await svc.searchAndDownload(VISUAL_PROMPT, "9:16");

    expect((svc as any).searchVideo).toHaveBeenCalledWith(
      expect.any(String),
      "portrait"
    );
  });

  it("16:9 aspect ratio → landscape orientation used in search", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    jest.spyOn(svc as any, "searchVideo").mockResolvedValue(PEXELS_CDN_URL);
    jest.spyOn(svc as any, "downloadToS3").mockResolvedValue(S3_URL);

    await svc.searchAndDownload(VISUAL_PROMPT, "16:9");

    expect((svc as any).searchVideo).toHaveBeenCalledWith(
      expect.any(String),
      "landscape"
    );
  });

  it("Pexels returns 0 results → throws error", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ videos: [], total_results: 0 }),
    });
    const svc = await buildService(cache, mockFetch);

    await expect(svc.searchAndDownload(VISUAL_PROMPT, "16:9")).rejects.toThrow(
      /No Pexels results/
    );
  });

  // UT-10-08: no fs.writeFile during download
  it("UT-10-08: downloadToS3 does not call fs.writeFile", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    const svc = await buildService(cache, mockFetch);
    (svc as any).s3 = { send: jest.fn().mockResolvedValue({}) };

    const writeSpy = jest.spyOn(fs, "writeFile");
    const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

    await (svc as any).downloadToS3(PEXELS_CDN_URL, `video/${CACHE_KEY}.mp4`);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });

  // UT-10-09: idempotent — already-downloaded URL skips S3 upload
  it("UT-10-09: same external URL already in S3 → no duplicate upload", async () => {
    const cache = makeCacheMock(null);
    cache.getCachedByUrlHash = jest.fn().mockResolvedValue(S3_URL);

    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);
    (svc as any).s3 = { send: jest.fn() };

    const result = await (svc as any).downloadToS3(PEXELS_CDN_URL, `video/${CACHE_KEY}.mp4`);

    expect(result).toBe(S3_URL);
    expect((svc as any).s3.send).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("selectBestFile picks portrait HD file for portrait orientation", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    const files = makePexelsVideoResponse("portrait").videos[0].video_files;
    const selected = (svc as any).selectBestFile(files, "portrait");

    // Portrait: height > width
    expect(selected.height).toBeGreaterThan(selected.width);
    expect(selected.quality).toBe("hd");
  });
});
