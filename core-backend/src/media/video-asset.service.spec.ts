/**
 * Unit tests for VideoAssetService — UT-10-10, IT-10-01, IT-10-02, IT-10-03
 */
import { Test } from "@nestjs/testing";
import { VideoAssetService } from "./video-asset.service";
import { VideoProviderRegistry } from "./video-provider-registry";

const RUNWAY_S3 = "s3://bucket/video/runway-cache.mp4";
const PEXELS_S3 = "s3://bucket/video/pexels-cache.mp4";
const PARAMS = {
  visualPrompt: "Stock market graph falling rapidly",
  sceneId: "scene-uuid-001",
  aspectRatio: "16:9" as const,
};

async function buildService(registryMock: any) {
  const module = await Test.createTestingModule({
    providers: [
      VideoAssetService,
      { provide: VideoProviderRegistry, useValue: registryMock },
    ],
  }).compile();

  return module.get(VideoAssetService);
}

describe("VideoAssetService", () => {
  // IT-10-01: Registry returns primary provider result
  it("IT-10-01: registry succeeds → returns s3Url and provider name", async () => {
    const registry = {
      generate: jest.fn().mockResolvedValue({ s3Url: RUNWAY_S3, provider: "runway" }),
      getProviderStatus: jest.fn(),
    };
    const svc = await buildService(registry);

    const result = await svc.generateVideo(PARAMS);

    expect(result.s3Url).toBe(RUNWAY_S3);
    expect(result.s3Url).toMatch(/^s3:\/\//);
    expect(result.provider).toBe("runway");
    expect(registry.generate).toHaveBeenCalledWith(PARAMS);
  });

  // IT-10-02: Registry falls back internally and returns Pexels result
  it("IT-10-02: registry falls back → returns Pexels s3:// URL", async () => {
    const registry = {
      generate: jest.fn().mockResolvedValue({ s3Url: PEXELS_S3, provider: "pexels" }),
      getProviderStatus: jest.fn(),
    };
    const svc = await buildService(registry);

    const result = await svc.generateVideo(PARAMS);

    expect(result.s3Url).toBe(PEXELS_S3);
    expect(result.s3Url).toMatch(/^s3:\/\//);
    expect(result.provider).toBe("pexels");
  });

  // UT-10-10: All providers fail → registry error propagates
  it("UT-10-10: all providers fail → error from registry propagates", async () => {
    const registry = {
      generate: jest.fn().mockRejectedValue(new Error("All video providers failed.")),
      getProviderStatus: jest.fn(),
    };
    const svc = await buildService(registry);

    await expect(svc.generateVideo(PARAMS)).rejects.toThrow("All video providers failed.");
  });

  it("passes correct params including aspectRatio to registry", async () => {
    const registry = {
      generate: jest.fn().mockResolvedValue({ s3Url: PEXELS_S3, provider: "pexels" }),
      getProviderStatus: jest.fn(),
    };
    const svc = await buildService(registry);

    await svc.generateVideo({ ...PARAMS, aspectRatio: "9:16" });

    expect(registry.generate).toHaveBeenCalledWith({ ...PARAMS, aspectRatio: "9:16" });
  });
});
