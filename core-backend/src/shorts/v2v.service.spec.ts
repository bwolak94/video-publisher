import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { V2VService, GenerateV2VDto } from "./v2v.service";
import { SourceClipsService } from "../source-clips/source-clips.service";
import { DRIZZLE } from "../db/db.module";

// Mock fal.ai client
jest.mock("@fal-ai/client", () => ({
  fal: {
    config: jest.fn(),
    subscribe: jest.fn(),
  },
}));

import { fal } from "@fal-ai/client";

// Mock child_process and fs to avoid real ffmpeg/S3 calls
jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from("fake-fragment")),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

// Mock AWS SDK
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Body: (async function* () {})() }),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://presigned.example.com/fragment.mp4"),
}));

const mockSourceClip = {
  id: "clip-uuid",
  name: "test.mp4",
  s3_url: "s3://video-publisher-assets/source-clips/clip-uuid/original.mp4",
  duration_s: "10.00",
  fps: "24.00",
  resolution: "1920x1080",
  created_at: new Date(),
};

describe("V2VService", () => {
  let service: V2VService;
  let sourceClipsService: jest.Mocked<SourceClipsService>;

  beforeEach(async () => {
    const mockDb = {};

    const mockSourceClipsService: Partial<jest.Mocked<SourceClipsService>> = {
      findById: jest.fn(),
      upload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V2VService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: SourceClipsService, useValue: mockSourceClipsService },
      ],
    }).compile();

    service = module.get<V2VService>(V2VService);
    sourceClipsService = module.get(SourceClipsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("generateV2V", () => {
    const dto: GenerateV2VDto = {
      sourceClipId: "clip-uuid",
      in: 2,
      out: 7,
      controls: ["motion-blur", "color-grade"],
      characterId: null,
    };

    it("returns clipS3Url and status queued when source clip exists", async () => {
      sourceClipsService.findById.mockResolvedValue(mockSourceClip as any);
      (fal.subscribe as jest.Mock).mockResolvedValue({
        data: { video: { url: "https://cdn.fal.ai/result.mp4" } },
      });

      // Mock fetch for result download
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("fake-video").buffer,
      }) as any;

      // Spy on protected uploadBuffer to avoid real S3
      jest.spyOn(service as any, "uploadBuffer").mockResolvedValue(undefined);

      const result = await service.generateV2V("job-123", "scene-456", dto);

      expect(result).toEqual({
        clipS3Url: expect.stringContaining("clips/job-123/scene-456/v2v.mp4"),
        status: "queued",
      });
      expect(sourceClipsService.findById).toHaveBeenCalledWith("clip-uuid");
      expect(fal.subscribe as jest.Mock).toHaveBeenCalledWith(
        "fal-ai/wan/video-to-video",
        expect.objectContaining({
          input: expect.objectContaining({
            video_url: "https://presigned.example.com/fragment.mp4",
            guidance_scale: 7.5,
          }),
        }),
      );
    });

    it("throws NotFoundException when sourceClipId does not exist", async () => {
      sourceClipsService.findById.mockResolvedValue(null);

      await expect(service.generateV2V("job-123", "scene-456", dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(fal.subscribe as jest.Mock).not.toHaveBeenCalled();
    });
  });
});
