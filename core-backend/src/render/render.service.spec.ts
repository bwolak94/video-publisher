/**
 * Unit tests for RenderService — UT-14-06
 */
import { Test } from "@nestjs/testing";
import { RenderService } from "./render.service";
import { S3Service } from "../storage/s3.service";
import { NonS3UrlError } from "../storyboard/predownload-errors";
import { VideoStoryboard } from "../storyboard/video-storyboard";

jest.mock("../storage/s3.service");

function makeStoryboard(scenes: Array<{ audioUrl?: string; videoUrl?: string }>): VideoStoryboard {
  return {
    meta: { title: "Test", aspectRatio: "9:16", language: "en", voiceId: "voice-1" },
    timeline: scenes.map((s, i) => ({
      sceneId: `scene-${i + 1}`,
      sequenceNumber: i + 1,
      durationInSeconds: 5,
      narrationText: "text",
      visualPrompt: "prompt",
      ...s,
    })),
  };
}

describe("RenderService", () => {
  let service: RenderService;
  let s3: jest.Mocked<S3Service>;

  beforeEach(async () => {
    process.env.S3_BUCKET_NAME = "test-bucket";
    process.env.REMOTION_FUNCTION_NAME = "remotion-render-fn";
    process.env.REMOTION_SERVE_URL = "https://example.com/remotion";

    const module = await Test.createTestingModule({
      providers: [
        RenderService,
        {
          provide: S3Service,
          useValue: { getPresignedUrl: jest.fn().mockResolvedValue("https://presigned.s3.example.com/key") },
        },
      ],
    }).compile();

    service = module.get(RenderService);
    s3 = module.get(S3Service) as jest.Mocked<S3Service>;

    // Mock the protected callRenderMedia so we don't invoke real Lambda
    jest.spyOn(service as any, "callRenderMedia").mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.S3_BUCKET_NAME;
    delete process.env.REMOTION_FUNCTION_NAME;
    delete process.env.REMOTION_SERVE_URL;
  });

  // UT-14-06
  it("throws NonS3UrlError when storyboard contains non-S3 videoUrl (UT-14-06)", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/audio/a.mp3", videoUrl: "https://videos.pexels.com/video.mp4" },
    ]);

    await expect(service.render(storyboard, "proj-1")).rejects.toThrow(NonS3UrlError);
    expect((service as any).callRenderMedia).not.toHaveBeenCalled();
  });

  it("throws NonS3UrlError when storyboard contains non-S3 audioUrl", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "https://external.cdn.com/audio.mp3", videoUrl: "s3://bucket/video/v.mp4" },
    ]);

    await expect(service.render(storyboard, "proj-1")).rejects.toThrow(NonS3UrlError);
  });

  it("calls renderMediaOnLambda and returns s3:// URL when all URLs are s3://", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/audio/a.mp3", videoUrl: "s3://bucket/video/v.mp4" },
    ]);

    const result = await service.render(storyboard, "proj-1");

    expect((service as any).callRenderMedia).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/^s3:\/\/test-bucket\/renders\/proj-1\/\d+\.mp4$/);
  });

  it("converts s3:// URLs to pre-signed HTTPS before dispatching to Lambda", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/audio/a.mp3", videoUrl: "s3://bucket/video/v.mp4" },
    ]);

    await service.render(storyboard, "proj-1");

    // Pre-signed URL generation called for each URL
    expect(s3.getPresignedUrl).toHaveBeenCalledWith("audio/a.mp3", 7200);
    expect(s3.getPresignedUrl).toHaveBeenCalledWith("video/v.mp4", 7200);
  });
});
