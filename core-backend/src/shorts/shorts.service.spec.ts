import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, UnprocessableEntityException } from "@nestjs/common";
import { ShortsService, ANTHROPIC_HTTP } from "./shorts.service";
import { DRIZZLE } from "../db/db.module";
import type { ScenePlanScene } from "./schemas/scene-plan.schema";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeScene(index: number): ScenePlanScene {
  return {
    scene_id:      `s0${index + 1}`,
    duration_s:    5,
    characters:    [],
    image_prompt:  `image prompt ${index}`,
    motion_prompt: `motion prompt ${index}`,
    camera:        "wide shot",
    voiceover:     `voiceover ${index}`,
    sfx_tags:      ["ambient"],
    model_hint:    "landscape",
  };
}

function buildScenePlanResponse(count: number): string {
  const scenes = Array.from({ length: count }, (_, i) => makeScene(i));
  return JSON.stringify(scenes);
}

function mockFetch(responses: Array<{ ok: boolean; text: string }>) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.ok ? 200 : 500,
      text: () => Promise.resolve(r.text),
      json: () => Promise.resolve({
        content: [{ text: r.text }],
      }),
    });
  });
}

function mockDb(returnId = "job-uuid-1234") {
  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: returnId }]),
      }),
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ShortsService", () => {
  let service: ShortsService;
  let fetchMock: jest.Mock;
  let dbMock: ReturnType<typeof mockDb>;

  async function buildService(responses: Array<{ ok: boolean; text: string }>) {
    fetchMock = mockFetch(responses);
    dbMock = mockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShortsService,
        { provide: DRIZZLE,        useValue: dbMock },
        { provide: ANTHROPIC_HTTP, useValue: fetchMock },
      ],
    }).compile();

    service = module.get<ShortsService>(ShortsService);
  }

  describe("generateScenePlan — valid 30s brief", () => {
    it("returns jobId and 6-scene scenePlan", async () => {
      // First call: moderation → "NO"; second call: scene plan JSON
      await buildService([
        { ok: true, text: "NO" },
        { ok: true, text: buildScenePlanResponse(6) },
      ]);

      const result = await service.generateScenePlan({
        brief:        "A hero saves the city from a robot invasion",
        nicheId:      null,
        characterIds: [],
        budgetUsd:    4,
        duration:     30,
        shotTrack:    "i2v",
        hitl:         true,
      });

      expect(result.jobId).toBe("job-uuid-1234");
      expect(result.scenePlan).toHaveLength(6);
      expect(result.scenePlan[0].scene_id).toBe("s01");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("generateScenePlan — moderation trigger", () => {
    it("throws BadRequestException when LLM returns YES", async () => {
      await buildService([{ ok: true, text: "YES, this brief mentions a real person." }]);

      await expect(
        service.generateScenePlan({
          brief:        "Make a video about Elon Musk building rockets",
          nicheId:      null,
          characterIds: [],
          budgetUsd:    4,
          duration:     30,
          shotTrack:    "mix",
          hitl:         false,
        }),
      ).rejects.toThrow(BadRequestException);

      // DB should never be called when moderation blocks
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it("includes moderation key in the exception response", async () => {
      await buildService([{ ok: true, text: "YES" }]);

      try {
        await service.generateScenePlan({
          brief:        "Video starring Taylor Swift",
          nicheId:      null,
          characterIds: [],
          budgetUsd:    4,
          duration:     15,
          shotTrack:    "v2v",
          hitl:         true,
        });
        fail("Expected BadRequestException");
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.response.moderation).toContain("rzeczywistej osoby");
      }
    });
  });

  describe("generateScenePlan — invalid JSON with retry", () => {
    it("succeeds on second attempt when first response is malformed", async () => {
      await buildService([
        { ok: true, text: "NO" },                          // moderation
        { ok: true, text: "not valid json {{" },           // first scene plan attempt — bad
        { ok: true, text: buildScenePlanResponse(6) },     // retry — good
      ]);

      const result = await service.generateScenePlan({
        brief:        "Cinematic travel video through Tokyo streets",
        nicheId:      null,
        characterIds: [],
        budgetUsd:    4,
        duration:     30,
        shotTrack:    "i2v",
        hitl:         true,
      });

      expect(result.scenePlan).toHaveLength(6);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws UnprocessableEntityException when both attempts fail", async () => {
      await buildService([
        { ok: true, text: "NO" },
        { ok: true, text: "not json" },
        { ok: true, text: "still not json" },
      ]);

      await expect(
        service.generateScenePlan({
          brief:        "Abstract art showcase",
          nicheId:      null,
          characterIds: [],
          budgetUsd:    4,
          duration:     30,
          shotTrack:    "mix",
          hitl:         true,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
