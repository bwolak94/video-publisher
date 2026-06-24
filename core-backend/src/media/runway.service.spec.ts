/**
 * Unit tests for RunwayService — UT-10-03, UT-10-04, UT-10-05, UT-10-06, UT-10-08, UT-10-09
 */
import { Test } from "@nestjs/testing";
import { RunwayService, RUNWAY_HTTP } from "./runway.service";
import { VideoCacheService } from "./video-cache.service";

const CACHE_KEY = "deadbeef1234";
const RUNWAY_CDN_URL = "https://cdn.runway.com/output/video.mp4";
const S3_URL = `s3://test-bucket/video/${CACHE_KEY}.mp4`;
const VISUAL_PROMPT = "Close-up of stock market graph falling rapidly";

function makeCacheMock(cachedUrl: string | null = null) {
  return {
    computeCacheKey: jest.fn().mockReturnValue(CACHE_KEY),
    getCached: jest.fn().mockResolvedValue(cachedUrl),
    setCached: jest.fn().mockResolvedValue(undefined),
    computeUrlHash: jest.fn().mockReturnValue("urlhash123"),
    getCachedByUrlHash: jest.fn().mockResolvedValue(null),
    setCachedByUrlHash: jest.fn().mockResolvedValue(undefined),
  };
}

async function buildService(cacheMock: any, mockFetch: jest.Mock) {
  const module = await Test.createTestingModule({
    providers: [
      RunwayService,
      { provide: VideoCacheService, useValue: cacheMock },
      { provide: RUNWAY_HTTP, useValue: mockFetch },
    ],
  }).compile();

  return module.get(RunwayService);
}

describe("RunwayService", () => {
  // UT-10-03: cache hit → no API call
  it("UT-10-03: cache hit returns S3 URL without any Runway API call", async () => {
    const cache = makeCacheMock(S3_URL);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    const url = await svc.generateVideo({ visualPrompt: VISUAL_PROMPT });
    expect(url).toBe(S3_URL);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // UT-10-04: Runway SUCCEEDED after 2 polls → S3 URL returned
  it("UT-10-04: SUCCEEDED after 2 polls → returns s3:// URL", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    // Stub submitTask and pollUntilComplete
    jest.spyOn(svc as any, "submitTask").mockResolvedValue("task-001");
    jest.spyOn(svc as any, "pollUntilComplete").mockResolvedValue(RUNWAY_CDN_URL);
    jest.spyOn(svc as any, "downloadToS3").mockResolvedValue(S3_URL);

    const url = await svc.generateVideo({ visualPrompt: VISUAL_PROMPT });
    expect(url).toBe(S3_URL);
    expect(cache.setCached).toHaveBeenCalledWith(CACHE_KEY, S3_URL);
  });

  // UT-10-05: Runway FAILED → error thrown (VideoAssetService handles fallback)
  it("UT-10-05: Runway FAILED status → throws error", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    jest.spyOn(svc as any, "submitTask").mockResolvedValue("task-002");
    jest.spyOn(svc as any, "pollUntilComplete").mockRejectedValue(
      new Error("Runway task task-002 failed")
    );

    await expect(svc.generateVideo({ visualPrompt: VISUAL_PROMPT })).rejects.toThrow(
      "Runway task task-002 failed"
    );
  });

  // UT-10-06: polling timeout → throws TIMEOUT error
  it("UT-10-06: polling timeout throws error with TIMEOUT code", async () => {
    const cache = makeCacheMock(null);
    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);

    jest.spyOn(svc as any, "submitTask").mockResolvedValue("task-timeout");
    jest.spyOn(svc as any, "pollUntilComplete").mockRejectedValue(
      Object.assign(new Error("Runway polling timeout after 120000ms"), { code: "TIMEOUT" })
    );

    const err: any = await svc
      .generateVideo({ visualPrompt: VISUAL_PROMPT })
      .catch((e) => e);
    expect(err.code).toBe("TIMEOUT");
  });

  // UT-10-08: downloadToS3 uses no fs.writeFile
  it("UT-10-08: downloadToS3 does not call fs.writeFile", async () => {
    const cache = makeCacheMock(null);
    // Mock fetch to return a fake arraybuffer
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    const svc = await buildService(cache, mockFetch);

    // Stub S3 send
    (svc as any).s3 = { send: jest.fn().mockResolvedValue({}) };

    const fs = require("fs");
    const writeSpy = jest.spyOn(fs, "writeFile");
    const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

    await (svc as any).downloadToS3(RUNWAY_CDN_URL, `video/${CACHE_KEY}.mp4`);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });

  // UT-10-09: idempotent — same external URL not uploaded twice
  it("UT-10-09: same external URL returns cached S3 URL without re-uploading", async () => {
    const cache = makeCacheMock(null);
    cache.getCachedByUrlHash = jest.fn().mockResolvedValue(S3_URL); // already cached

    const mockFetch = jest.fn();
    const svc = await buildService(cache, mockFetch);
    (svc as any).s3 = { send: jest.fn() };

    const result = await (svc as any).downloadToS3(RUNWAY_CDN_URL, `video/${CACHE_KEY}.mp4`);

    expect(result).toBe(S3_URL);
    expect((svc as any).s3.send).not.toHaveBeenCalled(); // no duplicate upload
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
