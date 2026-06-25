import { YouTubeVisibilityService } from "./youtube-visibility.service";

describe("YouTubeVisibilityService", () => {
  let service: YouTubeVisibilityService;
  let mockAuth: { getAccessToken: jest.Mock };
  let mockYouTubeUpdate: jest.Mock;

  beforeEach(() => {
    mockYouTubeUpdate = jest.fn().mockResolvedValue({ data: {} });
    mockAuth = { getAccessToken: jest.fn().mockResolvedValue("access-tok") };
    service = new YouTubeVisibilityService(mockAuth as any);
    jest.spyOn(service as any, "buildYouTubeClient").mockReturnValue({
      videos: { update: mockYouTubeUpdate },
    });
  });

  // IT-24-03
  it("promote calls YouTube API with the specified privacyStatus", async () => {
    await service.promote("ch-1", "dQw4w9WgXcQ", "public");

    expect(mockYouTubeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        part: ["status"],
        requestBody: expect.objectContaining({
          id: "dQw4w9WgXcQ",
          status: { privacyStatus: "public" },
        }),
      })
    );
  });

  it("schedulePublish calls YouTube API with privacyStatus=private and publishAt", async () => {
    await service.schedulePublish("ch-1", "video-abc", "2026-07-01T09:00:00Z");

    expect(mockYouTubeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          status: { privacyStatus: "private", publishAt: "2026-07-01T09:00:00Z" },
        }),
      })
    );
  });
});
