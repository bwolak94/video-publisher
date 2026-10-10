import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { T2iService, KeyframeVariant } from "./t2i.service";
import { DRIZZLE } from "../db/db.module";
import { S3Service } from "../storage/s3.service";

// Mock the entire @fal-ai/client module so no network calls are made.
jest.mock("@fal-ai/client", () => ({
  fal: {
    config: jest.fn(),
    subscribe: jest.fn(),
  },
}));

import { fal } from "@fal-ai/client";

const mockFalSubscribe = fal.subscribe as jest.MockedFunction<typeof fal.subscribe>;

// Minimal fake fal.ai success response matching the SDK shape: { data, requestId }
function makeFalResult(imageUrl: string) {
  return { data: { images: [{ url: imageUrl }] }, requestId: "req-test-123" };
}

// Minimal S3Service mock — returns predictable s3:// URLs.
const mockS3Service = {
  uploadBuffer: jest.fn(async (key: string) => `s3://test-bucket/${key}`),
};

// Minimal DB mock.
const mockDb = {
  execute: jest.fn(),
};

describe("T2iService", () => {
  let service: T2iService;

  const jobId = "550e8400-e29b-41d4-a716-446655440000";
  const sceneId = "s01";
  const scenePlan = [
    {
      scene_id: "s01",
      image_prompt: "A futuristic city at dawn",
      duration_s: 5,
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        T2iService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<T2iService>(T2iService);
  });

  describe("generateKeyframes", () => {
    it("returns two variants when both fal.ai calls succeed", async () => {
      mockDb.execute
        .mockResolvedValueOnce([{ scene_plan: scenePlan }])
        .mockResolvedValueOnce([{ id: "kf-id-0", s3_url: "s3://test-bucket/keyframes/job/s01/v0.jpg", seed: "111" }])
        .mockResolvedValueOnce([{ id: "kf-id-1", s3_url: "s3://test-bucket/keyframes/job/s01/v1.jpg", seed: "222" }]);

      mockFalSubscribe
        .mockResolvedValueOnce(makeFalResult("https://cdn.fal.ai/img/v0.jpg") as any)
        .mockResolvedValueOnce(makeFalResult("https://cdn.fal.ai/img/v1.jpg") as any);

      // Stub global fetch so image download does not hit the network.
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      const variants: KeyframeVariant[] = await service.generateKeyframes(jobId, sceneId);

      expect(variants).toHaveLength(2);
      expect(variants[0]).toMatchObject({
        s3Url: expect.stringContaining("s3://"),
        seed: expect.any(Number),
        similarity: 0,
      });
      expect(mockFalSubscribe).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadBuffer).toHaveBeenCalledTimes(2);
    });

    it("skips failed fal.ai variants and returns only successful ones", async () => {
      mockDb.execute
        .mockResolvedValueOnce([{ scene_plan: scenePlan }])
        .mockResolvedValueOnce([{ id: "kf-id-0", s3_url: "s3://test-bucket/keyframes/job/s01/v0.jpg", seed: "111" }]);

      // First variant succeeds, second rejects.
      mockFalSubscribe
        .mockResolvedValueOnce(makeFalResult("https://cdn.fal.ai/img/v0.jpg") as any)
        .mockRejectedValueOnce(new Error("fal.ai rate limit"));

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(512),
      });

      const variants: KeyframeVariant[] = await service.generateKeyframes(jobId, sceneId);

      expect(variants).toHaveLength(1);
      expect(mockFalSubscribe).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadBuffer).toHaveBeenCalledTimes(1);
    });

    it("throws NotFoundException when job does not exist", async () => {
      mockDb.execute.mockResolvedValueOnce([]); // empty result = no job found

      await expect(service.generateKeyframes("non-existent-id", sceneId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when sceneId is not in the scene plan", async () => {
      mockDb.execute.mockResolvedValueOnce([{ scene_plan: scenePlan }]);

      await expect(service.generateKeyframes(jobId, "s99")).rejects.toThrow(NotFoundException);
    });
  });

  describe("acceptKeyframe", () => {
    it("executes an UPDATE and returns { status: 'accepted' }", async () => {
      mockDb.execute.mockResolvedValueOnce([]);

      const result = await service.acceptKeyframe(jobId, sceneId, "kf-uuid-abc");

      expect(result).toEqual({ status: "accepted" });
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });
  });
});
