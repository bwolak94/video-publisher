/**
 * Unit tests for ElevenLabsService — UT-09-05, UT-09-07, UT-09-08
 */
import { Test } from "@nestjs/testing";
import { ElevenLabsService, ELEVENLABS_HTTP, GenerateAudioParams } from "./elevenlabs.service";
import { AudioCacheService } from "./audio-cache.service";
import { SettingsService } from "../settings/settings.service";

const settingsMock = { getPlaintext: jest.fn().mockResolvedValue(null) };

const CACHE_KEY = "abc123def456";
const S3_URL = "https://bucket.s3.amazonaws.com/audio/abc123def456.mp3";
const AUDIO_BUFFER = Buffer.from("fake-mp3-data");

const PARAMS: GenerateAudioParams = {
  narrationText: "The market declined today.",
  voiceId: "voice_cloned",
  standardVoiceId: "voice_standard",
};

function makeService(overrides: {
  cachedUrl?: string | null;
  setCachedShouldFail?: boolean;
  uploadShouldFail?: boolean;
  fetchStatus?: number;
} = {}) {
  const { cachedUrl = null, setCachedShouldFail = false, fetchStatus = 200 } = overrides;

  const cacheMock = {
    computeCacheKey: jest.fn().mockReturnValue(CACHE_KEY),
    getCached: jest.fn().mockResolvedValue(cachedUrl),
    setCached: setCachedShouldFail
      ? jest.fn().mockRejectedValue(new Error("Redis failure"))
      : jest.fn().mockResolvedValue(undefined),
  };

  const mockFetch = jest.fn().mockResolvedValue({
    ok: fetchStatus >= 200 && fetchStatus < 300,
    status: fetchStatus,
    arrayBuffer: jest.fn().mockResolvedValue(AUDIO_BUFFER.buffer),
  });

  return { cacheMock, mockFetch };
}

async function buildService(
  cacheMock: any,
  mockFetch: jest.Mock,
  uploadShouldFail = false
) {
  const module = await Test.createTestingModule({
    providers: [
      ElevenLabsService,
      { provide: AudioCacheService, useValue: cacheMock },
      { provide: ELEVENLABS_HTTP, useValue: mockFetch },
      { provide: SettingsService, useValue: settingsMock },
    ],
  }).compile();

  const svc = module.get(ElevenLabsService);

  // Stub S3 upload
  if (uploadShouldFail) {
    jest.spyOn(svc as any, "uploadToS3").mockRejectedValue(new Error("S3 upload failed"));
  } else {
    jest.spyOn(svc as any, "uploadToS3").mockResolvedValue(S3_URL);
  }

  return svc;
}

describe("ElevenLabsService", () => {
  // UT-09-05: S3 upload fails → Redis NOT written
  it("UT-09-05: S3 upload fails → cache.setCached not called", async () => {
    const { cacheMock, mockFetch } = makeService({ cachedUrl: null, uploadShouldFail: true });
    const svc = await buildService(cacheMock, mockFetch, true);

    await expect(svc.generateAudio(PARAMS)).rejects.toThrow("S3 upload failed");
    expect(cacheMock.setCached).not.toHaveBeenCalled();
  });

  // UT-09-07: ElevenLabs returns 400 → fallback to standardVoiceId
  it("UT-09-07: 400 on cloned voice → retried with standardVoiceId", async () => {
    const { cacheMock, mockFetch } = makeService({ cachedUrl: null, fetchStatus: 200 });

    // First call returns 400, second succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 400, arrayBuffer: jest.fn() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: jest.fn().mockResolvedValue(AUDIO_BUFFER.buffer),
      });

    const svc = await buildService(cacheMock, mockFetch);
    const url = await svc.generateAudio(PARAMS);

    expect(url).toBe(S3_URL);
    // First call used cloned voice, second used standardVoiceId
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCallUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain(PARAMS.standardVoiceId);
  });

  // UT-09-08: circuit breaker opens after 5 consecutive failures
  it("UT-09-08: 5th failure opens circuit; 6th call throws CircuitOpenError without API call", async () => {
    const { cacheMock, mockFetch } = makeService({ cachedUrl: null });
    // All fetch calls fail with 500
    mockFetch.mockResolvedValue({ ok: false, status: 500, arrayBuffer: jest.fn() });

    const svc = await buildService(cacheMock, mockFetch);

    let callCount = 0;
    for (let i = 0; i < 5; i++) {
      try {
        await svc.generateAudio(PARAMS);
      } catch {
        callCount++;
      }
    }
    expect(callCount).toBe(5);

    // 6th call — circuit is open, should throw CircuitOpenError without calling fetch
    const fetchCallsBefore = mockFetch.mock.calls.length;
    await expect(svc.generateAudio(PARAMS)).rejects.toThrow("Circuit breaker OPEN");
    expect(mockFetch.mock.calls.length).toBe(fetchCallsBefore); // no new fetch call
  });

  it("cache hit → returns S3 URL without calling ElevenLabs", async () => {
    const { cacheMock, mockFetch } = makeService({ cachedUrl: S3_URL });
    const svc = await buildService(cacheMock, mockFetch);

    const url = await svc.generateAudio(PARAMS);
    expect(url).toBe(S3_URL);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
