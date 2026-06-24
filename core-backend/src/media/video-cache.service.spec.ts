/**
 * Unit tests for VideoCacheService — UT-10-01, UT-10-02
 */
import { Test } from "@nestjs/testing";
import { VideoCacheService } from "./video-cache.service";
import { REDIS_CLIENT } from "../redis/redis.module";

const PROMPT = "Close-up of stock market graph falling rapidly in red";
const MODEL_A = "gen3a_turbo";
const MODEL_B = "gen3a";
const RES_1080 = "1080p";
const RES_720 = "720p";
const S3_URL = "s3://bucket/video/abc123.mp4";

function makeRedisMock(storedUrl: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(storedUrl),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

describe("VideoCacheService", () => {
  let service: VideoCacheService;
  let redis: ReturnType<typeof makeRedisMock>;

  async function build(storedUrl: string | null = null) {
    redis = makeRedisMock(storedUrl);
    const module = await Test.createTestingModule({
      providers: [
        VideoCacheService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = module.get(VideoCacheService);
  }

  // UT-10-01: same prompt + model → same cache key
  it("UT-10-01: same prompt+model+resolution produces same cache key", async () => {
    await build();
    const k1 = service.computeCacheKey(PROMPT, MODEL_A, RES_1080);
    const k2 = service.computeCacheKey(PROMPT, MODEL_A, RES_1080);
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64); // sha256 hex
  });

  // UT-10-02: different resolution → different cache key
  it("UT-10-02: different resolution produces different cache key", async () => {
    await build();
    const k1080 = service.computeCacheKey(PROMPT, MODEL_A, RES_1080);
    const k720 = service.computeCacheKey(PROMPT, MODEL_A, RES_720);
    expect(k1080).not.toBe(k720);
  });

  it("different model → different cache key", async () => {
    await build();
    const kA = service.computeCacheKey(PROMPT, MODEL_A, RES_1080);
    const kB = service.computeCacheKey(PROMPT, MODEL_B, RES_1080);
    expect(kA).not.toBe(kB);
  });

  it("getCached() returns S3 URL on cache hit", async () => {
    await build(S3_URL);
    const key = service.computeCacheKey(PROMPT, MODEL_A, RES_1080);
    const result = await service.getCached(key);
    expect(result).toBe(S3_URL);
    expect(redis.get).toHaveBeenCalledWith(`video:${key}`);
  });

  it("getCached() returns null on cache miss", async () => {
    await build(null);
    const result = await service.getCached("nonexistent-key");
    expect(result).toBeNull();
  });

  it("setCached() writes S3 URL to Redis with 7-day TTL", async () => {
    await build();
    const key = "abc123";
    await service.setCached(key, S3_URL);
    expect(redis.set).toHaveBeenCalledWith(
      `video:${key}`,
      S3_URL,
      "EX",
      7 * 24 * 60 * 60
    );
  });

  it("computeUrlHash returns consistent hash for same URL", async () => {
    await build();
    const h1 = service.computeUrlHash("https://cdn.runway.com/video.mp4");
    const h2 = service.computeUrlHash("https://cdn.runway.com/video.mp4");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("getCachedByUrlHash returns null on miss", async () => {
    await build(null);
    const result = await service.getCachedByUrlHash("somehash");
    expect(result).toBeNull();
  });
});
