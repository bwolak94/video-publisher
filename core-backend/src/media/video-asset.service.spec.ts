/**
 * Unit tests for VideoAssetService — UT-10-10, IT-10-01, IT-10-02, IT-10-03
 */
import { Test } from "@nestjs/testing";
import { VideoAssetService } from "./video-asset.service";
import { RunwayService } from "./runway.service";
import { PexelsService } from "./pexels.service";

const RUNWAY_S3 = "s3://bucket/video/runway-cache.mp4";
const PEXELS_S3 = "s3://bucket/video/pexels-cache.mp4";
const PARAMS = {
  visualPrompt: "Stock market graph falling rapidly",
  sceneId: "scene-uuid-001",
  aspectRatio: "16:9" as const,
};

async function buildService(runwayMock: any, pexelsMock: any) {
  const module = await Test.createTestingModule({
    providers: [
      VideoAssetService,
      { provide: RunwayService, useValue: runwayMock },
      { provide: PexelsService, useValue: pexelsMock },
    ],
  }).compile();

  return module.get(VideoAssetService);
}

describe("VideoAssetService", () => {
  // IT-10-01: Runway succeeds → Runway S3 URL
  it("IT-10-01: Runway succeeds → returns Runway s3:// URL", async () => {
    const runway = { generateVideo: jest.fn().mockResolvedValue(RUNWAY_S3) };
    const pexels = { searchAndDownload: jest.fn() };
    const svc = await buildService(runway, pexels);

    const url = await svc.generateVideo(PARAMS);

    expect(url).toBe(RUNWAY_S3);
    expect(url).toMatch(/^s3:\/\//);
    expect(pexels.searchAndDownload).not.toHaveBeenCalled();
  });

  // IT-10-02: Runway fails → falls back to Pexels
  it("IT-10-02: Runway fails → falls back to Pexels s3:// URL", async () => {
    const runway = {
      generateVideo: jest.fn().mockRejectedValue(new Error("Runway timeout")),
    };
    const pexels = {
      searchAndDownload: jest.fn().mockResolvedValue(PEXELS_S3),
    };
    const svc = await buildService(runway, pexels);

    const url = await svc.generateVideo(PARAMS);

    expect(url).toBe(PEXELS_S3);
    expect(url).toMatch(/^s3:\/\//);
    expect(pexels.searchAndDownload).toHaveBeenCalledWith(
      PARAMS.visualPrompt,
      PARAMS.aspectRatio
    );
  });

  // IT-10-03: Both fail → structured error
  it("UT-10-10: both providers fail → structured error with sceneId", async () => {
    const runway = {
      generateVideo: jest.fn().mockRejectedValue(new Error("Runway 500")),
    };
    const pexels = {
      searchAndDownload: jest.fn().mockRejectedValue(new Error("No Pexels results")),
    };
    const svc = await buildService(runway, pexels);

    const err: any = await svc.generateVideo(PARAMS).catch((e) => e);

    expect(err.error).toBe("asset_generation_failed");
    expect(err.sceneId).toBe(PARAMS.sceneId);
    expect(err.reason).toBe("No Pexels results");
  });

  it("passes correct aspectRatio to Pexels when Runway fails", async () => {
    const runway = {
      generateVideo: jest.fn().mockRejectedValue(new Error("Runway failed")),
    };
    const pexels = {
      searchAndDownload: jest.fn().mockResolvedValue(PEXELS_S3),
    };
    const svc = await buildService(runway, pexels);

    await svc.generateVideo({ ...PARAMS, aspectRatio: "9:16" });

    expect(pexels.searchAndDownload).toHaveBeenCalledWith(
      PARAMS.visualPrompt,
      "9:16"
    );
  });
});
