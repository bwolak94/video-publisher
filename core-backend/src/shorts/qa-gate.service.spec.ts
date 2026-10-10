import { Test, TestingModule } from "@nestjs/testing";
import { QaGateService, QA_GATE_HTTP, QaEvaluateParams } from "./qa-gate.service";
import { DRIZZLE } from "../db/db.module";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAnthropicFetch(scoreText: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(scoreText),
    json: () =>
      Promise.resolve({
        content: [{ text: scoreText }],
      }),
  });
}

function mockDb() {
  return {
    execute: jest.fn().mockResolvedValue([]),
  };
}

const BASE_PARAMS: QaEvaluateParams = {
  jobId:        "job-uuid-001",
  sceneId:      "s01",
  clipS3Url:    "s3://bucket/clips/job-uuid-001/s01/v0.mp4",
  imagePrompt:  "A futuristic city skyline at dusk",
  motionPrompt: "Slow pan left with lens flare",
  attempt:      1,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QaGateService", () => {
  let service: QaGateService;
  let dbMock: ReturnType<typeof mockDb>;
  let fetchMock: jest.Mock;

  async function buildService(scoreText = "0.90") {
    fetchMock = makeAnthropicFetch(scoreText);
    dbMock = mockDb();

    // Expose ANTHROPIC_API_KEY so vlmArtifactCheck / vlmPromptAlign actually
    // call the mocked fetch instead of returning the no-key default (0.8).
    process.env.ANTHROPIC_API_KEY = "test-key";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QaGateService,
        { provide: DRIZZLE,      useValue: dbMock },
        { provide: QA_GATE_HTTP, useValue: fetchMock },
      ],
    }).compile();

    service = module.get<QaGateService>(QaGateService);
  }

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    jest.clearAllMocks();
  });

  // ── score range ─────────────────────────────────────────────────────────────

  it("returns a score between 0.0 and 1.0 for a healthy clip", async () => {
    await buildService("0.90");

    const result = await service.evaluate(BASE_PARAMS);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  // ── passing threshold ───────────────────────────────────────────────────────

  it("passes when score >= 0.75 (default threshold)", async () => {
    // face=0.5, artifact=0.9, promptAlign=0.9
    // score = 0.4*0.5 + 0.3*0.9 + 0.3*0.9 = 0.2 + 0.27 + 0.27 = 0.74
    // To guarantee pass, mock Anthropic to return high scores
    await buildService("0.95");

    const result = await service.evaluate(BASE_PARAMS);

    // 0.4*0.5 + 0.3*0.95 + 0.3*0.95 = 0.2 + 0.285 + 0.285 = 0.77 >= 0.75
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.75);
  });

  it("fails when score < 0.75", async () => {
    // Force Anthropic to return 0.0 so score = 0.4*0.5 + 0 + 0 = 0.2
    await buildService("0.0");

    const result = await service.evaluate(BASE_PARAMS);

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.75);
  });

  // ── checks shape ────────────────────────────────────────────────────────────

  it("returns checks object with faceSim, artifactScore, promptAlign", async () => {
    await buildService("0.80");

    const result = await service.evaluate(BASE_PARAMS);

    expect(result.checks).toHaveProperty("faceSim");
    expect(result.checks).toHaveProperty("artifactScore");
    expect(result.checks).toHaveProperty("promptAlign");

    // faceSim is always placeholder 0.5
    expect(result.checks.faceSim).toBe(0.5);
    expect(result.checks.artifactScore).toBeGreaterThanOrEqual(0);
    expect(result.checks.artifactScore).toBeLessThanOrEqual(1);
    expect(result.checks.promptAlign).toBeGreaterThanOrEqual(0);
    expect(result.checks.promptAlign).toBeLessThanOrEqual(1);
  });

  // ── DB insert ────────────────────────────────────────────────────────────────

  it("calls db.execute once to persist the scene_clips row", async () => {
    await buildService("0.85");

    await service.evaluate(BASE_PARAMS);

    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it("persists the correct jobId and sceneId in the SQL call", async () => {
    await buildService("0.85");

    await service.evaluate({ ...BASE_PARAMS, jobId: "job-abc", sceneId: "s03" });

    const sqlArg = dbMock.execute.mock.calls[0][0];
    // The sql template tag produces an object; verify the raw strings contain our identifiers.
    expect(JSON.stringify(sqlArg)).toContain("job-abc");
    expect(JSON.stringify(sqlArg)).toContain("s03");
  });

  // ── no-key fallback ──────────────────────────────────────────────────────────

  it("falls back to default scores (0.8) when no Anthropic API key is set", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    fetchMock = jest.fn();
    dbMock = mockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QaGateService,
        { provide: DRIZZLE,      useValue: dbMock },
        { provide: QA_GATE_HTTP, useValue: fetchMock },
      ],
    }).compile();

    const svc = module.get<QaGateService>(QaGateService);
    const result = await svc.evaluate(BASE_PARAMS);

    // With defaults: face=0.5, artifact=0.8, promptAlign=0.8
    // score = 0.4*0.5 + 0.3*0.8 + 0.3*0.8 = 0.2 + 0.24 + 0.24 = 0.68
    expect(result.score).toBeCloseTo(0.68, 5);
    // fetch should never be called when there is no API key
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── characterRefUrls ─────────────────────────────────────────────────────────

  it("uses 0.5 faceSim regardless of characterRefUrls presence (placeholder)", async () => {
    await buildService("0.85");

    const withRefs = await service.evaluate({
      ...BASE_PARAMS,
      characterRefUrls: ["s3://bucket/ref1.jpg"],
    });

    const withoutRefs = await service.evaluate({
      ...BASE_PARAMS,
      characterRefUrls: [],
    });

    expect(withRefs.checks.faceSim).toBe(0.5);
    expect(withoutRefs.checks.faceSim).toBe(0.5);
  });
});
