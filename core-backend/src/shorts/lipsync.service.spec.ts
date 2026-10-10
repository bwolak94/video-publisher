import { Test, TestingModule } from "@nestjs/testing";
import { LipsyncService, LipsyncFallbackError } from "./lipsync.service";
import { fal } from "@fal-ai/client";

jest.mock("@fal-ai/client", () => ({
  fal: {
    subscribe: jest.fn(),
  },
}));

const mockFal = fal as jest.Mocked<typeof fal>;

describe("LipsyncService", () => {
  let service: LipsyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [LipsyncService],
    }).compile();

    service = module.get<LipsyncService>(LipsyncService);

    // Stub protected S3/network helpers so tests don't make real calls
    jest.spyOn(service as any, "generateTts").mockResolvedValue("s3://bucket/clips/job1/scene1/dialog.mp3");
    jest.spyOn(service as any, "uploadResultClip").mockResolvedValue("s3://bucket/clips/job1/scene1/lipsync.mp4");
  });

  describe("generateLipsync", () => {
    it("returns expected shape when fal.subscribe succeeds", async () => {
      (mockFal.subscribe as jest.Mock).mockResolvedValue({
        video: { url: "https://cdn.fal.ai/result.mp4" },
      });

      const result = await service.generateLipsync({
        jobId: "job1",
        sceneId: "scene1",
        clipS3Url: "s3://bucket/clips/job1/scene1/raw.mp4",
        dialog: "Hello world",
        voiceId: "voice_abc",
      });

      expect(result).toMatchObject({
        audioS3Url: "s3://bucket/clips/job1/scene1/dialog.mp3",
        clipS3Url:  "s3://bucket/clips/job1/scene1/lipsync.mp4",
        qaScore:    0.85,
      });
    });

    it("throws LipsyncFallbackError when fal.subscribe returns no video URL", async () => {
      (mockFal.subscribe as jest.Mock).mockResolvedValue({ data: {} });

      await expect(
        service.generateLipsync({
          jobId: "job2",
          sceneId: "scene2",
          clipS3Url: "",
          dialog: "Test",
          voiceId: "voice_xyz",
        }),
      ).rejects.toThrow(LipsyncFallbackError);
    });

    it("throws LipsyncFallbackError when fal.subscribe rejects", async () => {
      (mockFal.subscribe as jest.Mock).mockRejectedValue(new Error("fal API error"));

      await expect(
        service.generateLipsync({
          jobId: "job3",
          sceneId: "scene3",
          clipS3Url: "",
          dialog: "Test",
          voiceId: "voice_xyz",
        }),
      ).rejects.toThrow(LipsyncFallbackError);
    });

    it("throws LipsyncFallbackError when TTS step fails", async () => {
      jest.spyOn(service as any, "generateTts").mockRejectedValue(new Error("ElevenLabs timeout"));

      await expect(
        service.generateLipsync({
          jobId: "job4",
          sceneId: "scene4",
          clipS3Url: "",
          dialog: "Test",
          voiceId: "voice_xyz",
        }),
      ).rejects.toThrow(LipsyncFallbackError);
    });
  });
});
