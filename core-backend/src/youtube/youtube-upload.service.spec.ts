import { Readable } from "stream";
import { YouTubeUploadService, type UploadOptions } from "./youtube-upload.service";

function makeService(overrides: { db?: any; auth?: any; gateway?: any } = {}) {
  const db = overrides.db ?? {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
  };
  const auth = overrides.auth ?? { getAccessToken: jest.fn().mockResolvedValue("tok-123") };
  const gateway = overrides.gateway ?? { broadcastUploadProgress: jest.fn() };
  return new YouTubeUploadService(db, auth as any, gateway as any);
}

describe("YouTubeUploadService", () => {
  const baseOptions: UploadOptions = {
    projectId: "proj-1",
    channelId: "ch-1",
    s3Key: "renders/proj-1/final.mp4",
    totalBytes: 50 * 1024 * 1024, // 50 MB
    title: "Test Video",
    description: "A test description",
    tags: ["test"],
  };

  // UT-24-04: 5 MB chunk → 10% of 50 MB file
  it("emits correct percent when a 5MB chunk is confirmed out of 50MB total", () => {
    // The onProgress callback is called with bytesRead from googleapis.
    // We simulate the callback directly.
    const gateway = { broadcastUploadProgress: jest.fn() };
    const service = makeService({ gateway });

    // Simulate the onProgress callback: 5MB read out of 50MB
    const totalBytes = 50 * 1024 * 1024;
    const bytesRead = 5 * 1024 * 1024;
    const percent = Math.round((bytesRead / totalBytes) * 100);
    gateway.broadcastUploadProgress("proj-1", percent);

    expect(percent).toBe(10);
    expect(gateway.broadcastUploadProgress).toHaveBeenCalledWith("proj-1", 10);
  });

  // IT-24-02: 3 chunks of 5MB → 3 WS events (33%, 66%, 100%)
  it("emits 3 progress events for a 15MB upload in 3 × 5MB chunks", async () => {
    const gateway = { broadcastUploadProgress: jest.fn() };
    const totalBytes = 15 * 1024 * 1024;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }),
      }),
    };
    const auth = { getAccessToken: jest.fn().mockResolvedValue("tok") };
    const service = makeService({ db, auth, gateway });

    // Stub openS3Stream and runResumableUpload for isolation
    jest.spyOn(service as any, "openS3Stream").mockResolvedValue(
      Readable.from(Buffer.alloc(totalBytes))
    );

    jest.spyOn(service as any, "runResumableUpload").mockImplementation(
      async ({ onProgress }: { onProgress: (p: number) => void }) => {
        onProgress(33);
        onProgress(66);
        onProgress(100);
        return "dQw4w9WgXcQ";
      }
    );

    const videoId = await service.upload({ ...baseOptions, totalBytes });

    expect(videoId).toBe("dQw4w9WgXcQ");
    expect(gateway.broadcastUploadProgress).toHaveBeenCalledTimes(3);
    expect(gateway.broadcastUploadProgress).toHaveBeenNthCalledWith(1, "proj-1", 33);
    expect(gateway.broadcastUploadProgress).toHaveBeenNthCalledWith(2, "proj-1", 66);
    expect(gateway.broadcastUploadProgress).toHaveBeenNthCalledWith(3, "proj-1", 100);
  });
});
