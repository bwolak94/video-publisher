/**
 * Unit tests for PreRenderValidatorService — FEATURE-07 Quality Gates.
 *
 * UT-07-01: Valid storyboard passes all checks
 * UT-07-02: Missing videoUrl produces error
 * UT-07-03: Missing audioUrl produces error
 * UT-07-04: Non-S3 videoUrl produces error
 * UT-07-05: Non-S3 audioUrl produces error
 * UT-07-06: Empty timeline produces error
 * UT-07-07: Multiple scenes — errors from all scenes collected
 * UT-07-08: Zero-byte video file produces integrity error
 * UT-07-09: Zero-byte audio file produces integrity error
 * UT-07-10: Invalid video codec produces format error
 * UT-07-11: Video shorter than narration produces duration error
 * UT-07-12: S3 HeadObject failure degrades gracefully (passes)
 * UT-07-13: Python FFprobe service unreachable degrades gracefully (passes)
 */
import { PreRenderValidatorService } from "./pre-render-validator.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStoryboard(scenes: Partial<{
  sceneId: string;
  videoUrl: string | undefined;
  audioUrl: string | undefined;
  durationInSeconds: number | undefined;
}>[]): VideoStoryboard {
  return {
    meta: {
      title: "Test Video",
      aspectRatio: "16:9",
      language: "en",
      voiceId: "test-voice",
    },
    timeline: scenes.map((s, i) => ({
      sceneId: s.sceneId ?? `sc-${i + 1}`,
      sequenceNumber: i + 1,
      narrationText: "Narration",
      visualPrompt: "Visual prompt with at least ten words here",
      videoUrl: "videoUrl" in s ? s.videoUrl : `s3://bucket/video/${i + 1}.mp4`,
      audioUrl: "audioUrl" in s ? s.audioUrl : `s3://bucket/audio/${i + 1}.mp3`,
      durationInSeconds: s.durationInSeconds,
    })),
  };
}

/** Default mock S3 service — all objects exist and are non-empty. */
function makeMockS3(overrides: Partial<{
  getObjectSize: jest.Mock;
  getPresignedUrl: jest.Mock;
}> = {}) {
  return {
    getObjectSize: overrides.getObjectSize ?? jest.fn().mockResolvedValue(102_400),
    getPresignedUrl: overrides.getPresignedUrl ?? jest.fn().mockResolvedValue("https://s3.example.com/presigned"),
  };
}

/** Default mock fetch — Python returns allValid=true, no issues. */
function mockFetchOk(results: object[] = []) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ allValid: results.length === 0 || results.every((r: any) => r.valid), results }),
  }) as any;
}

function mockFetchError() {
  global.fetch = jest.fn().mockRejectedValue(new Error("Connection refused")) as any;
}

function mockFetchHttp500() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PreRenderValidatorService", () => {
  let service: PreRenderValidatorService;

  beforeEach(() => {
    service = new PreRenderValidatorService(makeMockS3() as any);
    mockFetchOk();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── UT-07-01: happy path ────────────────────────────────────────────────

  it("passes when all scenes have valid s3:// URLs and assets are healthy", async () => {
    const storyboard = makeStoryboard([{}, {}, {}]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.checkedAt).toBeTruthy();
  });

  // ── UT-07-02 / 03: missing URLs ─────────────────────────────────────────

  it("fails when a scene is missing videoUrl", async () => {
    const storyboard = makeStoryboard([{ videoUrl: undefined }]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "videoUrl" && e.sceneId === "sc-1")).toBe(true);
  });

  it("fails when a scene is missing audioUrl", async () => {
    const storyboard = makeStoryboard([{ audioUrl: undefined }]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "audioUrl" && e.sceneId === "sc-1")).toBe(true);
  });

  // ── UT-07-04 / 05: non-S3 URLs ──────────────────────────────────────────

  it("fails when videoUrl is an https:// URL (not s3://)", async () => {
    const storyboard = makeStoryboard([{ videoUrl: "https://cdn.example.com/video.mp4" }]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(false);
    const err = report.errors.find((e) => e.field === "videoUrl");
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/not an s3/i);
  });

  it("fails when audioUrl is an https:// URL (not s3://)", async () => {
    const storyboard = makeStoryboard([{ audioUrl: "https://cdn.example.com/audio.mp3" }]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "audioUrl")).toBe(true);
  });

  // ── UT-07-06: empty timeline ─────────────────────────────────────────────

  it("fails on empty timeline", async () => {
    const storyboard = makeStoryboard([]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "integrity")).toBe(true);
  });

  // ── UT-07-07: multiple scenes, all errors collected ──────────────────────

  it("collects errors from all scenes in one pass", async () => {
    const storyboard = makeStoryboard([
      { videoUrl: undefined },           // sc-1: missing videoUrl
      { audioUrl: "http://bad.url" },    // sc-2: non-S3 audioUrl
      {},                                // sc-3: valid
    ]);
    const report = await service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(2);
    expect(report.errors.map((e) => e.sceneId)).toContain("sc-1");
    expect(report.errors.map((e) => e.sceneId)).toContain("sc-2");
  });

  it("includes checkedAt timestamp in ISO format", async () => {
    const storyboard = makeStoryboard([{}]);
    const report = await service.validate(storyboard);
    expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt);
  });

  // ── UT-07-08 / 09: zero-byte files ──────────────────────────────────────

  it("fails when video asset is zero bytes", async () => {
    const getObjectSize = jest.fn()
      .mockResolvedValueOnce(0)        // video → zero-byte
      .mockResolvedValue(102_400);     // audio → OK
    service = new PreRenderValidatorService(makeMockS3({ getObjectSize }) as any);

    const report = await service.validate(makeStoryboard([{}]));

    expect(report.passed).toBe(false);
    const err = report.errors.find((e) => e.field === "videoUrl");
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/zero-byte/i);
  });

  it("fails when audio asset is zero bytes", async () => {
    const getObjectSize = jest.fn()
      .mockResolvedValueOnce(102_400)  // video → OK
      .mockResolvedValueOnce(0);       // audio → zero-byte
    service = new PreRenderValidatorService(makeMockS3({ getObjectSize }) as any);

    const report = await service.validate(makeStoryboard([{}]));

    expect(report.passed).toBe(false);
    const err = report.errors.find((e) => e.field === "audioUrl");
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/zero-byte/i);
  });

  // ── UT-07-10: invalid format (FFprobe) ──────────────────────────────────

  it("fails when video has an unsupported codec", async () => {
    mockFetchOk([
      { sceneId: "sc-1", assetType: "video", valid: false, error: "Unsupported video codec: 'theora'" },
      { sceneId: "sc-1", assetType: "audio", valid: true, error: null },
    ]);

    const report = await service.validate(makeStoryboard([{}]));

    expect(report.passed).toBe(false);
    const err = report.errors.find((e) => e.field === "format");
    expect(err).toBeDefined();
    expect(err!.sceneId).toBe("sc-1");
  });

  // ── UT-07-11: video shorter than narration ────────────────────────────────

  it("fails when video is shorter than narration duration", async () => {
    mockFetchOk([
      {
        sceneId: "sc-1",
        assetType: "video",
        valid: false,
        error: "Video duration 2.5s is shorter than narration duration 5.0s",
      },
      { sceneId: "sc-1", assetType: "audio", valid: true, error: null },
    ]);

    const report = await service.validate(makeStoryboard([{ durationInSeconds: 5.0 }]));

    expect(report.passed).toBe(false);
    const err = report.errors.find((e) => e.field === "duration");
    expect(err).toBeDefined();
    expect(err!.sceneId).toBe("sc-1");
  });

  // ── UT-07-12: S3 HeadObject failure (graceful degradation) ───────────────

  it("passes when S3 HeadObject throws — zero-byte check is skipped gracefully", async () => {
    const getObjectSize = jest.fn().mockRejectedValue(new Error("Network error"));
    service = new PreRenderValidatorService(makeMockS3({ getObjectSize }) as any);

    const report = await service.validate(makeStoryboard([{}]));

    expect(report.passed).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  // ── UT-07-13: Python FFprobe unreachable (graceful degradation) ───────────

  it("passes when Python FFprobe service is unreachable — format checks are skipped gracefully", async () => {
    mockFetchError();

    const report = await service.validate(makeStoryboard([{}]));

    expect(report.passed).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("passes when Python FFprobe returns HTTP 500 — format checks are skipped gracefully", async () => {
    mockFetchHttp500();

    const report = await service.validate(makeStoryboard([{}]));

    expect(report.passed).toBe(true);
    expect(report.errors).toHaveLength(0);
  });
});
