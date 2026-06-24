/**
 * Unit tests for ImageAssetService — UT-11-03, UT-11-07, UT-11-08, IT-11-01..03
 */
import { Test } from "@nestjs/testing";
import { ImageAssetService } from "./image-asset.service";
import { ImageCacheService } from "./image-cache.service";
import { PromptSafetyService } from "./prompt-safety.service";
import { DallE3Service } from "./dalle3.service";
import { StableDiffusionService } from "./stable-diffusion.service";

const PROMPT = "Aerial drone shot of New York City skyline at sunset";
const CACHE_KEY = "cachedkey123";
const DALLE_S3 = "s3://bucket/images/dalle.png";
const SD_S3 = "s3://bucket/images/sd.png";
const PARAMS = { visualPrompt: PROMPT, sceneId: "scene-001", aspectRatio: "16:9" as const };

function makeCacheMock(cachedUrl: string | null = null) {
  return {
    computeCacheKey: jest.fn().mockReturnValue(CACHE_KEY),
    getCached: jest.fn().mockResolvedValue(cachedUrl),
    setCached: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSafetyMock(passthrough = true) {
  return {
    safePrompt: jest.fn().mockImplementation((p: string) => Promise.resolve(passthrough ? p : "safe version")),
  };
}

function makeDalleMock(result: string | Error) {
  return {
    generateAndUpload: jest.fn().mockImplementation(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    ),
  };
}

function makeSdMock(available: boolean, result?: string | Error) {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    generateAndUpload: jest.fn().mockImplementation(() => {
      if (!result) return Promise.reject(new Error("SD not expected"));
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }),
  };
}

async function buildService(
  cacheMock: any,
  safetyMock: any,
  dalleMock: any,
  sdMock: any
) {
  const module = await Test.createTestingModule({
    providers: [
      ImageAssetService,
      { provide: ImageCacheService, useValue: cacheMock },
      { provide: PromptSafetyService, useValue: safetyMock },
      { provide: DallE3Service, useValue: dalleMock },
      { provide: StableDiffusionService, useValue: sdMock },
    ],
  }).compile();
  return module.get(ImageAssetService);
}

describe("ImageAssetService", () => {
  // UT-11-03 / IT-11-03: cache hit
  it("UT-11-03 / IT-11-03: cache hit returns S3 URL without any API call", async () => {
    const cache = makeCacheMock(DALLE_S3);
    const safety = makeSafetyMock();
    const dalle = makeDalleMock(DALLE_S3);
    const sd = makeSdMock(false);
    const svc = await buildService(cache, safety, dalle, sd);

    const url = await svc.generateImage(PARAMS);

    expect(url).toBe(DALLE_S3);
    expect(safety.safePrompt).not.toHaveBeenCalled();
    expect(dalle.generateAndUpload).not.toHaveBeenCalled();
  });

  // IT-11-01: DALL-E succeeds
  it("IT-11-01: DALL-E succeeds → returns s3:// URL", async () => {
    const cache = makeCacheMock(null);
    const safety = makeSafetyMock();
    const dalle = makeDalleMock(DALLE_S3);
    const sd = makeSdMock(false);
    const svc = await buildService(cache, safety, dalle, sd);

    const url = await svc.generateImage(PARAMS);

    expect(url).toBe(DALLE_S3);
    expect(url).toMatch(/^s3:\/\//);
    expect(cache.setCached).toHaveBeenCalledWith(CACHE_KEY, DALLE_S3);
    expect(sd.generateAndUpload).not.toHaveBeenCalled();
  });

  // UT-11-07 / IT-11-02: DALL-E fails → SD fallback
  it("UT-11-07 / IT-11-02: DALL-E 429 → SD fallback called and s3:// URL returned", async () => {
    const dalleErr: any = new Error("DALL-E 3 API error: 429");
    dalleErr.status = 429;

    const cache = makeCacheMock(null);
    const safety = makeSafetyMock();
    const dalle = makeDalleMock(dalleErr);
    const sd = makeSdMock(true, SD_S3);
    const svc = await buildService(cache, safety, dalle, sd);

    const url = await svc.generateImage(PARAMS);

    expect(url).toBe(SD_S3);
    expect(sd.generateAndUpload).toHaveBeenCalledTimes(1);
    expect(cache.setCached).toHaveBeenCalledWith(CACHE_KEY, SD_S3);
  });

  // UT-11-08: SD_API_URL not set → DALL-E error propagated
  it("UT-11-08: SD not available → DALL-E error propagated", async () => {
    const dalleErr: any = new Error("DALL-E 3 API error: 429");
    dalleErr.status = 429;

    const cache = makeCacheMock(null);
    const safety = makeSafetyMock();
    const dalle = makeDalleMock(dalleErr);
    const sd = makeSdMock(false); // SD disabled
    const svc = await buildService(cache, safety, dalle, sd);

    await expect(svc.generateImage(PARAMS)).rejects.toThrow("DALL-E 3 API error: 429");
    expect(sd.generateAndUpload).not.toHaveBeenCalled();
    expect(cache.setCached).not.toHaveBeenCalled();
  });

  it("passes correct size to DALL-E based on aspect ratio", async () => {
    const cache = makeCacheMock(null);
    const safety = makeSafetyMock();
    const dalle = makeDalleMock(DALLE_S3);
    const sd = makeSdMock(false);
    const svc = await buildService(cache, safety, dalle, sd);

    await svc.generateImage({ ...PARAMS, aspectRatio: "9:16" });

    // s3Key should contain the cache key; size should be 1024x1792
    const [, , s3Key] = dalle.generateAndUpload.mock.calls[0];
    expect(dalle.generateAndUpload.mock.calls[0][1]).toBe("1024x1792");
    expect(s3Key).toMatch(/^images\/.+\.png$/);
  });

  it("prompt safety is called before DALL-E", async () => {
    const callOrder: string[] = [];
    const cache = makeCacheMock(null);
    const safety = {
      safePrompt: jest.fn().mockImplementation(async (p: string) => {
        callOrder.push("safety");
        return p;
      }),
    };
    const dalle = {
      generateAndUpload: jest.fn().mockImplementation(async () => {
        callOrder.push("dalle");
        return DALLE_S3;
      }),
    };
    const sd = makeSdMock(false);
    const svc = await buildService(cache, safety, dalle, sd);

    await svc.generateImage(PARAMS);

    expect(callOrder).toEqual(["safety", "dalle"]);
  });
});
