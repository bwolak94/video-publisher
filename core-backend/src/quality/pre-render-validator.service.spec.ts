/**
 * Unit tests for PreRenderValidatorService — FEATURE-07 Quality Gates.
 *
 * UT-07-01: Valid storyboard passes validation
 * UT-07-02: Missing videoUrl produces error
 * UT-07-03: Missing audioUrl produces error
 * UT-07-04: Non-S3 videoUrl produces error
 * UT-07-05: Non-S3 audioUrl produces error
 * UT-07-06: Empty timeline produces error
 * UT-07-07: Multiple scenes — errors from all scenes collected
 */
import { PreRenderValidatorService } from "./pre-render-validator.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

function makeStoryboard(scenes: Partial<{
  sceneId: string;
  videoUrl: string | undefined;
  audioUrl: string | undefined;
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
    })),
  };
}

describe("PreRenderValidatorService", () => {
  let service: PreRenderValidatorService;

  beforeEach(() => {
    service = new PreRenderValidatorService();
  });

  // UT-07-01
  it("passes when all scenes have valid s3:// videoUrl and audioUrl", () => {
    const storyboard = makeStoryboard([{}, {}, {}]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.checkedAt).toBeTruthy();
  });

  // UT-07-02
  it("fails when a scene is missing videoUrl", () => {
    const storyboard = makeStoryboard([{ videoUrl: undefined }]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "videoUrl" && e.sceneId === "sc-1")).toBe(true);
  });

  // UT-07-03
  it("fails when a scene is missing audioUrl", () => {
    const storyboard = makeStoryboard([{ audioUrl: undefined }]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "audioUrl" && e.sceneId === "sc-1")).toBe(true);
  });

  // UT-07-04
  it("fails when videoUrl is an https:// URL (not s3://)", () => {
    const storyboard = makeStoryboard([{ videoUrl: "https://cdn.example.com/video.mp4" }]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(false);
    const err = report.errors.find((e) => e.field === "videoUrl");
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/not an s3/i);
  });

  // UT-07-05
  it("fails when audioUrl is an https:// URL (not s3://)", () => {
    const storyboard = makeStoryboard([{ audioUrl: "https://cdn.example.com/audio.mp3" }]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "audioUrl")).toBe(true);
  });

  // UT-07-06
  it("fails on empty timeline", () => {
    const storyboard = makeStoryboard([]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.some((e) => e.field === "integrity")).toBe(true);
  });

  // UT-07-07
  it("collects errors from all scenes in one pass", () => {
    const storyboard = makeStoryboard([
      { videoUrl: undefined },          // scene 1: missing videoUrl
      { audioUrl: "http://bad.url" },   // scene 2: non-S3 audioUrl
      {},                               // scene 3: valid
    ]);
    const report = service.validate(storyboard);

    expect(report.passed).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(2);

    const sceneIds = report.errors.map((e) => e.sceneId);
    expect(sceneIds).toContain("sc-1");
    expect(sceneIds).toContain("sc-2");
  });

  it("includes checkedAt timestamp in ISO format", () => {
    const storyboard = makeStoryboard([{}]);
    const report = service.validate(storyboard);
    expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt);
  });
});
