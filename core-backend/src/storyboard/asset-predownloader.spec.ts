/**
 * Unit tests for AssetPredownloader — UT-13-01..09
 */
import { AssetPredownloader, PREDOWNLOAD_HTTP } from "./asset-predownloader";
import { S3Service } from "../storage/s3.service";
import { VideoStoryboard } from "./video-storyboard";
import { NonS3UrlError, PredownloadError } from "./predownload-errors";
import { Test } from "@nestjs/testing";

jest.mock("../storage/s3.service");

function makeStoryboard(scenes: Array<{ audioUrl?: string; videoUrl?: string }>): VideoStoryboard {
  return {
    meta: { title: "Test", aspectRatio: "16:9", language: "en", voiceId: "voice-1" },
    timeline: scenes.map((s, i) => ({
      sceneId: `scene-${i + 1}`,
      sequenceNumber: i + 1,
      narrationText: "text",
      visualPrompt: "prompt",
      ...s,
    })),
  };
}

describe("AssetPredownloader", () => {
  let predownloader: AssetPredownloader;
  let s3: jest.Mocked<S3Service>;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        AssetPredownloader,
        { provide: S3Service, useValue: { buildPath: jest.fn(), uploadStream: jest.fn() } },
        { provide: PREDOWNLOAD_HTTP, useValue: fetchMock },
      ],
    }).compile();

    predownloader = module.get(AssetPredownloader);
    s3 = module.get(S3Service) as jest.Mocked<S3Service>;
  });

  // UT-13-01: all URLs already s3:// → no downloads
  it("returns storyboard unchanged when 0 external URLs (UT-13-01)", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/audio/a.mp3", videoUrl: "s3://bucket/video/v.mp4" },
    ]);
    const result = await predownloader.normalizeStoryboard(storyboard);
    expect(result).toEqual(storyboard);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // UT-13-02: one external videoUrl → downloaded and rewritten
  it("downloads and rewrites one external videoUrl (UT-13-02)", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/audio/a.mp3", videoUrl: "https://pexels.com/video.mp4" },
    ]);

    const mockResponse = {
      ok: true,
      headers: { get: () => "video/mp4" },
      body: { [Symbol.asyncIterator]: async function* () { yield Buffer.from("data"); } },
    };
    fetchMock.mockResolvedValue(mockResponse);
    s3.buildPath.mockReturnValue("video/abc123.mp4");
    s3.uploadStream.mockResolvedValue("s3://bucket/video/abc123.mp4");

    const result = await predownloader.normalizeStoryboard(storyboard);
    expect(result.timeline[0].videoUrl).toBe("s3://bucket/video/abc123.mp4");
  });

  // UT-13-03: external URL download succeeds → rewritten URL starts with s3://
  it("rewritten URL starts with s3:// after successful download (UT-13-03)", async () => {
    const storyboard = makeStoryboard([{ videoUrl: "https://cdn.runway.com/output.mp4" }]);

    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "video/mp4" },
      body: { [Symbol.asyncIterator]: async function* () { yield Buffer.from("v"); } },
    });
    s3.buildPath.mockReturnValue("video/hash.mp4");
    s3.uploadStream.mockResolvedValue("s3://bucket/video/hash.mp4");

    const result = await predownloader.normalizeStoryboard(storyboard);
    expect(result.timeline[0].videoUrl!.startsWith("s3://")).toBe(true);
  });

  // UT-13-04: download fails (HTTP 404) → throws PredownloadError, no dispatch
  it("throws PredownloadError when external URL returns 404 (UT-13-04)", async () => {
    const storyboard = makeStoryboard([{ videoUrl: "https://pexels.com/missing.mp4" }]);
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });

    await expect(predownloader.normalizeStoryboard(storyboard)).rejects.toThrow(PredownloadError);
  });

  // UT-13-05: 1 of 3 external URLs fails → others downloaded; 1 failure blocks render
  it("collects failures without short-circuit: 2 succeed, 1 fails (UT-13-05)", async () => {
    const storyboard = makeStoryboard([
      { videoUrl: "https://pexels.com/a.mp4" },
      { videoUrl: "https://pexels.com/b.mp4" },
      { videoUrl: "https://pexels.com/FAIL.mp4" },
    ]);

    const okResponse = {
      ok: true,
      headers: { get: () => "video/mp4" },
      body: { [Symbol.asyncIterator]: async function* () { yield Buffer.from("v"); } },
    };
    fetchMock
      .mockResolvedValueOnce(okResponse)
      .mockResolvedValueOnce(okResponse)
      .mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    s3.buildPath.mockReturnValue("video/x.mp4");
    s3.uploadStream.mockResolvedValue("s3://bucket/video/x.mp4");

    await expect(predownloader.normalizeStoryboard(storyboard)).rejects.toThrow(PredownloadError);
    // Both successful uploads still happened
    expect(s3.uploadStream).toHaveBeenCalledTimes(2);
  });

  // UT-13-06: s3:// URL → skipped, S3Service not called
  it("skips s3:// URLs and does not call S3Service (UT-13-06)", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/audio/a.mp3", videoUrl: "s3://bucket/video/v.mp4" },
      { audioUrl: "s3://bucket/audio/b.mp3", videoUrl: "s3://bucket/video/w.mp4" },
    ]);

    const result = await predownloader.normalizeStoryboard(storyboard);
    expect(s3.uploadStream).not.toHaveBeenCalled();
    expect(result.timeline).toHaveLength(2);
  });

  // UT-13-07: all S3 after processing → no exception from assertAllS3
  it("final assertion passes when all URLs are s3:// (UT-13-07)", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "s3://bucket/a.mp3", videoUrl: "https://cdn.pexels.com/v.mp4" },
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "video/mp4" },
      body: { [Symbol.asyncIterator]: async function* () { yield Buffer.from("v"); } },
    });
    s3.buildPath.mockReturnValue("video/h.mp4");
    s3.uploadStream.mockResolvedValue("s3://bucket/video/h.mp4");

    await expect(predownloader.normalizeStoryboard(storyboard)).resolves.toBeDefined();
  });

  // UT-13-08: one HTTP URL slips through after rewrite → throws NonS3UrlError
  it("final assertion throws NonS3UrlError when non-s3 URL remains (UT-13-08)", async () => {
    const storyboard = makeStoryboard([
      { audioUrl: "https://cdn.example.com/audio.mp3" },
    ]);

    // Upload returns a non-s3 URL (bug simulation)
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "audio/mpeg" },
      body: { [Symbol.asyncIterator]: async function* () { yield Buffer.from("a"); } },
    });
    s3.buildPath.mockReturnValue("audio/h.mp3");
    s3.uploadStream.mockResolvedValue("https://still-external.com/audio.mp3"); // bug!

    await expect(predownloader.normalizeStoryboard(storyboard)).rejects.toThrow(NonS3UrlError);
  });

  // UT-13-09: downloads run in parallel — all fetch calls initiated before any resolved
  it("initiates all downloads in parallel (UT-13-09)", async () => {
    const callOrder: number[] = [];
    const storyboard = makeStoryboard([
      { videoUrl: "https://cdn.pexels.com/1.mp4" },
      { videoUrl: "https://cdn.pexels.com/2.mp4" },
      { videoUrl: "https://cdn.pexels.com/3.mp4" },
    ]);

    const resolvers: Array<() => void> = [];
    fetchMock.mockImplementation((url: string) => {
      const idx = parseInt(url.slice(-5, -4)) - 1;
      callOrder.push(idx);
      return new Promise<any>((resolve) => {
        resolvers.push(() =>
          resolve({
            ok: true,
            headers: { get: () => "video/mp4" },
            body: { [Symbol.asyncIterator]: async function* () { yield Buffer.from("v"); } },
          })
        );
      });
    });
    s3.buildPath.mockReturnValue("video/x.mp4");
    s3.uploadStream.mockResolvedValue("s3://bucket/video/x.mp4");

    const promise = predownloader.normalizeStoryboard(storyboard);
    // All 3 fetches should have been initiated before any resolved
    expect(callOrder).toEqual([0, 1, 2]);
    resolvers.forEach((r) => r());
    await promise;
  });
});
