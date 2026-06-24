/**
 * Unit tests for AudioCacheService — UT-09-01 through UT-09-04
 */
import { Test } from "@nestjs/testing";
import { AudioCacheService } from "./audio-cache.service";
import { REDIS_CLIENT } from "../redis/redis.module";

const TEXT = "The stock market crashed today causing widespread panic.";
const VOICE_A = "voice_abc123";
const VOICE_B = "voice_xyz999";
const S3_URL = "https://bucket.s3.amazonaws.com/audio/abc123.mp3";

function makeRedisMock(storedUrl: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(storedUrl),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

describe("AudioCacheService", () => {
  let service: AudioCacheService;
  let redis: ReturnType<typeof makeRedisMock>;

  async function build(storedUrl: string | null = null) {
    redis = makeRedisMock(storedUrl);
    const module = await Test.createTestingModule({
      providers: [
        AudioCacheService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = module.get(AudioCacheService);
  }

  // UT-09-01: same text + voice → same SHA256 hash
  it("UT-09-01: same text+voice produces same cache key", async () => {
    await build();
    const key1 = service.computeCacheKey(TEXT, VOICE_A);
    const key2 = service.computeCacheKey(TEXT, VOICE_A);
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // sha256 hex
  });

  // UT-09-02: same text, different voice → different hash
  it("UT-09-02: same text, different voice → different key", async () => {
    await build();
    const keyA = service.computeCacheKey(TEXT, VOICE_A);
    const keyB = service.computeCacheKey(TEXT, VOICE_B);
    expect(keyA).not.toBe(keyB);
  });

  // UT-09-03: getCached() when key exists → returns S3 URL, no API call implied
  it("UT-09-03: getCached() returns S3 URL on cache hit", async () => {
    await build(S3_URL);
    const cacheKey = service.computeCacheKey(TEXT, VOICE_A);
    const result = await service.getCached(cacheKey);
    expect(result).toBe(S3_URL);
    expect(redis.get).toHaveBeenCalledWith(`audio:${cacheKey}`);
  });

  // UT-09-04: getCached() when key absent → returns null
  it("UT-09-04: getCached() returns null on cache miss", async () => {
    await build(null);
    const result = await service.getCached("nonexistent-key");
    expect(result).toBeNull();
  });

  it("setCached() writes S3 URL to Redis with 7-day TTL", async () => {
    await build();
    const cacheKey = "abc123";
    await service.setCached(cacheKey, S3_URL);
    expect(redis.set).toHaveBeenCalledWith(
      `audio:${cacheKey}`,
      S3_URL,
      "EX",
      7 * 24 * 60 * 60
    );
  });
});
