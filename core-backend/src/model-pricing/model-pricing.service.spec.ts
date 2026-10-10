import { ModelPricingService } from "./model-pricing.service";

/** Minimal seed rows matching the 0026 migration data. */
const SEED_ROWS = [
  { role: "i2v-default", model: "wan-2.5",               price_per_unit: "0.050000", unit: "per_second",    is_active: true,  tag: "landscape" },
  { role: "i2v-action",  model: "kling-2.5-turbo-pro",   price_per_unit: "0.070000", unit: "per_second",    is_active: true,  tag: "action" },
  { role: "t2i",         model: "flux-dev",               price_per_unit: "0.040000", unit: "per_image",     is_active: true,  tag: null },
  { role: "tts",         model: "eleven-multilingual-v2", price_per_unit: "0.000625", unit: "per_1k_chars",  is_active: true,  tag: null },
  { role: "render",      model: "remotion-lambda",        price_per_unit: "0.020000", unit: "per_render",    is_active: true,  tag: null },
  { role: "qa",          model: "claude-3-5-haiku",       price_per_unit: "0.001000", unit: "per_render",    is_active: true,  tag: null },
  { role: "lipsync",     model: "wav2lip",                price_per_unit: "0.050000", unit: "per_second",    is_active: true,  tag: "dialog" },
  { role: "v2v",         model: "wan-2.5-v2v",            price_per_unit: "0.060000", unit: "per_second",    is_active: true,  tag: null },
  { role: "llm-outline", model: "claude-sonnet-4-6",      price_per_unit: "0.003000", unit: "per_render",    is_active: true,  tag: null },
];

function buildService(rows = SEED_ROWS): ModelPricingService {
  const mockDb = {
    execute: jest.fn().mockResolvedValue(rows),
  };

  // Build service without DI container so tests run without DB
  const service = new (ModelPricingService as any)(mockDb);
  return service as ModelPricingService;
}

describe("ModelPricingService.estimateCost()", () => {
  it("returns min in range 1.5–2.1 for a 6-scene plan with shotTrack=i2v", async () => {
    const service = buildService();

    const scenes = Array.from({ length: 6 }, (_, i) => ({
      id: `scene-${i + 1}`,
      duration_s: 5,
      voiceover: "Hello world this is a test voiceover text",
    }));

    const result = await service.estimateCost(scenes, "i2v");

    expect(result.min).toBeGreaterThanOrEqual(1.5);
    expect(result.min).toBeLessThanOrEqual(2.1);
    expect(result.max).toBeCloseTo(result.min * 1.3, 1);
    expect(result.breakdown.length).toBeGreaterThan(0);
  });

  it("selects v2v model when shotTrack is v2v", async () => {
    const service = buildService();

    const scenes = [{ id: "scene-1", duration_s: 5 }];
    const result = await service.estimateCost(scenes, "v2v");

    const v2vEntry = result.breakdown.find((b) => b.role === "v2v");
    expect(v2vEntry).toBeDefined();
    expect(v2vEntry!.model).toBe("wan-2.5-v2v");
  });

  it("selects i2v-action when scene.model_hint is action", async () => {
    const service = buildService();

    const scenes = [{ id: "scene-1", duration_s: 5, model_hint: "action" }];
    const result = await service.estimateCost(scenes, "i2v");

    const actionEntry = result.breakdown.find((b) => b.role === "i2v-action");
    expect(actionEntry).toBeDefined();
    expect(actionEntry!.model).toBe("kling-2.5-turbo-pro");
  });

  it("excludes inactive pricing rows from estimates", async () => {
    const rowsWithInactiveRender = SEED_ROWS.map((r) =>
      r.role === "render" ? { ...r, is_active: false } : r,
    );
    const service = buildService(rowsWithInactiveRender);

    const scenes = [{ id: "scene-1", duration_s: 5 }];
    const result = await service.estimateCost(scenes, "i2v");

    const renderEntry = result.breakdown.find((b) => b.role === "render");
    expect(renderEntry).toBeUndefined();
  });

  it("max equals min multiplied by 1.3 (rounded to 2 dp)", async () => {
    const service = buildService();

    const scenes = [{ id: "scene-1", duration_s: 10 }];
    const result = await service.estimateCost(scenes, "i2v");

    expect(result.max).toBeCloseTo(Math.round(result.min * 1.3 * 100) / 100, 5);
  });
});
