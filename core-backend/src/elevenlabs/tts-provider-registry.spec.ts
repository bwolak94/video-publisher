/**
 * Unit tests for TtsProviderRegistry (FEATURE-08)
 * UT-08-01..04
 */
import { Test } from "@nestjs/testing";
import { TtsProviderRegistry, piperModelName } from "./tts-provider-registry";
import { ElevenLabsService } from "./elevenlabs.service";
import { AudioCacheService } from "./audio-cache.service";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCacheMock(hit: string | null = null) {
  return {
    computeCacheKey: jest.fn().mockReturnValue("test-cache-key"),
    getCached: jest.fn().mockResolvedValue(hit),
    setCached: jest.fn().mockResolvedValue(undefined),
  };
}

function makeElevenLabsMock(result = "s3://bucket/audio/eleven.mp3") {
  return { generateAudio: jest.fn().mockResolvedValue(result) };
}

async function buildRegistry(cacheMock: any, elevenMock: any) {
  const module = await Test.createTestingModule({
    providers: [
      TtsProviderRegistry,
      { provide: ElevenLabsService, useValue: elevenMock },
      { provide: AudioCacheService, useValue: cacheMock },
    ],
  }).compile();
  return module.get(TtsProviderRegistry);
}

// ── UT-08-01: piperModelName conversion ──────────────────────────────────────

describe("piperModelName()", () => {
  it("converts piper_en_us_lessac_medium → en_US-lessac-medium", () => {
    expect(piperModelName("piper_en_us_lessac_medium")).toBe("en_US-lessac-medium");
  });

  it("converts piper_en_gb_alan_medium → en_GB-alan-medium", () => {
    expect(piperModelName("piper_en_gb_alan_medium")).toBe("en_GB-alan-medium");
  });

  it("converts piper_de_de_thorsten_medium → de_DE-thorsten-medium", () => {
    expect(piperModelName("piper_de_de_thorsten_medium")).toBe("de_DE-thorsten-medium");
  });

  it("converts piper_pl_pl_gosia_medium → pl_PL-gosia-medium", () => {
    expect(piperModelName("piper_pl_pl_gosia_medium")).toBe("pl_PL-gosia-medium");
  });
});

// ── UT-08-02: Cache hit → no provider call ───────────────────────────────────

describe("TtsProviderRegistry", () => {
  it("UT-08-02: returns cached URL without calling any provider", async () => {
    const cache = makeCacheMock("s3://bucket/audio/cached.mp3");
    const eleven = makeElevenLabsMock();
    const registry = await buildRegistry(cache, eleven);

    const url = await registry.generateAudio({
      narrationText: "Hello",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      standardVoiceId: "21m00Tcm4TlvDq8ikWAM",
    });

    expect(url).toBe("s3://bucket/audio/cached.mp3");
    expect(eleven.generateAudio).not.toHaveBeenCalled();
  });

  // UT-08-03: Non-piper voiceId → delegates to ElevenLabsService
  it("UT-08-03: non-piper voiceId routes to ElevenLabsService", async () => {
    const cache = makeCacheMock(null);
    const eleven = makeElevenLabsMock("s3://bucket/audio/eleven.mp3");
    const registry = await buildRegistry(cache, eleven);

    const url = await registry.generateAudio({
      narrationText: "Hello ElevenLabs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      standardVoiceId: "21m00Tcm4TlvDq8ikWAM",
    });

    expect(url).toBe("s3://bucket/audio/eleven.mp3");
    expect(eleven.generateAudio).toHaveBeenCalledWith({
      narrationText: "Hello ElevenLabs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      standardVoiceId: "21m00Tcm4TlvDq8ikWAM",
    });
  });

  // UT-08-04: piper_ voiceId → calls ai-backend, uploads to S3, writes cache
  it("UT-08-04: piper_ voiceId calls ai-backend and uploads to S3", async () => {
    const cache = makeCacheMock(null);
    const eleven = makeElevenLabsMock();
    const registry = await buildRegistry(cache, eleven);

    // Mock fetch (ai-backend call) and S3
    const mp3 = Buffer.from("fake-mp3-data");
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(mp3.buffer),
    });
    (registry as any).s3 = {
      send: jest.fn().mockResolvedValue({}),
    };
    global.fetch = mockFetch as any;

    const url = await registry.generateAudio({
      narrationText: "Hello Piper",
      voiceId: "piper_en_us_lessac_medium",
      standardVoiceId: "21m00Tcm4TlvDq8ikWAM",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tts/piper"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Hello Piper", model_name: "en_US-lessac-medium" }),
      }),
    );
    expect((registry as any).s3.send).toHaveBeenCalled();
    expect(cache.setCached).toHaveBeenCalledWith("test-cache-key", url);
    expect(url).toMatch(/^s3:\/\//);
    expect(eleven.generateAudio).not.toHaveBeenCalled();
  });
});
