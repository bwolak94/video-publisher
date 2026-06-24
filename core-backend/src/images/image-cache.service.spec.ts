import { Test } from "@nestjs/testing";
import { ImageCacheService } from "./image-cache.service";
import { REDIS_CLIENT } from "../redis/redis.module";

const PROMPT = "Aerial drone shot of New York City skyline at sunset, photorealistic";
const MODEL = "dall-e-3";
const SIZE_A = "1792x1024";
const SIZE_B = "1024x1792";
const S3_URL = "s3://bucket/images/abc123.png";

function makeRedisMock(storedUrl: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(storedUrl),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

describe("ImageCacheService", () => {
  let service: ImageCacheService;
  let redis: ReturnType<typeof makeRedisMock>;

  async function build(storedUrl: string | null = null) {
    redis = makeRedisMock(storedUrl);
    const module = await Test.createTestingModule({
      providers: [
        ImageCacheService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = module.get(ImageCacheService);
  }

  it("same prompt+model+size produces same cache key (length 64)", async () => {
    await build();
    const k1 = service.computeCacheKey(PROMPT, MODEL, SIZE_A);
    const k2 = service.computeCacheKey(PROMPT, MODEL, SIZE_A);
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64);
  });

  it("different size produces different cache key", async () => {
    await build();
    const kA = service.computeCacheKey(PROMPT, MODEL, SIZE_A);
    const kB = service.computeCacheKey(PROMPT, MODEL, SIZE_B);
    expect(kA).not.toBe(kB);
  });

  it("getCached() returns S3 URL on cache hit", async () => {
    await build(S3_URL);
    const key = service.computeCacheKey(PROMPT, MODEL, SIZE_A);
    const result = await service.getCached(key);
    expect(result).toBe(S3_URL);
    expect(redis.get).toHaveBeenCalledWith(`image:${key}`);
  });

  it("getCached() returns null on cache miss", async () => {
    await build(null);
    expect(await service.getCached("nonexistent")).toBeNull();
  });

  it("setCached() writes S3 URL with 7-day TTL", async () => {
    await build();
    await service.setCached("key123", S3_URL);
    expect(redis.set).toHaveBeenCalledWith(
      "image:key123",
      S3_URL,
      "EX",
      7 * 24 * 60 * 60
    );
  });
});
