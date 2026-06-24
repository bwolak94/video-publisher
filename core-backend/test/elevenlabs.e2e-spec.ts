/**
 * Integration tests for ElevenLabs TTS + cache — IT-09-01, IT-09-02, IT-09-03
 *
 * Mocks: ElevenLabs HTTP, S3, Redis. Tests the full service interaction chain.
 */
import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ElevenLabsService, ELEVENLABS_HTTP, GenerateAudioParams } from "../src/elevenlabs/elevenlabs.service";
import { AudioCacheService } from "../src/elevenlabs/audio-cache.service";
import { REDIS_CLIENT } from "../src/redis/redis.module";

const NARRATION = "Stocks fell 10% in a single trading session, sparking recession fears.";
const VOICE_ID = "voice_cloned_abc";
const STANDARD_VOICE_ID = "voice_standard_001";
const S3_URL = "https://bucket.s3.amazonaws.com/audio/fakehash.mp3";
const AUDIO_BYTES = Buffer.from("fake-mp3-binary");

const PARAMS: GenerateAudioParams = {
  narrationText: NARRATION,
  voiceId: VOICE_ID,
  standardVoiceId: STANDARD_VOICE_ID,
};

function makeRealFetch(status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: jest.fn().mockResolvedValue(AUDIO_BYTES.buffer),
  });
}

async function buildModule(fetchMock: jest.Mock, redisMock: any) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AudioCacheService,
      ElevenLabsService,
      { provide: REDIS_CLIENT, useValue: redisMock },
      { provide: ELEVENLABS_HTTP, useValue: fetchMock },
    ],
  }).compile();

  const svc = module.get(ElevenLabsService);
  jest.spyOn(svc as any, "uploadToS3").mockResolvedValue(S3_URL);

  return svc;
}

describe("ElevenLabs Integration (IT-09)", () => {
  // IT-09-01: cache miss path → ElevenLabs called, S3 URL stored in Redis
  it("IT-09-01: cache miss — ElevenLabs called, Redis populated with S3 URL", async () => {
    const redisMock = {
      get: jest.fn().mockResolvedValue(null), // cache miss
      set: jest.fn().mockResolvedValue("OK"),
    };
    const fetchMock = makeRealFetch(200);
    const svc = await buildModule(fetchMock, redisMock);

    const url = await svc.generateAudio(PARAMS);

    expect(url).toBe(S3_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Redis was written after S3 upload
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringMatching(/^audio:/),
      S3_URL,
      "EX",
      604800
    );
  });

  // IT-09-02: cache warm — ElevenLabs NOT called, same S3 URL returned
  it("IT-09-02: cache hit — ElevenLabs not called, returns cached S3 URL", async () => {
    const redisMock = {
      get: jest.fn().mockResolvedValue(S3_URL), // cache warm
      set: jest.fn().mockResolvedValue("OK"),
    };
    const fetchMock = makeRealFetch(200);
    const svc = await buildModule(fetchMock, redisMock);

    const url = await svc.generateAudio(PARAMS);

    expect(url).toBe(S3_URL);
    expect(fetchMock).not.toHaveBeenCalled(); // ElevenLabs skipped
    expect(redisMock.set).not.toHaveBeenCalled(); // Redis not re-written
  });

  // IT-09-03: ElevenLabs 503 × 3 then succeeds on 4th call → job completes
  it("IT-09-03: 503 × 3, succeeds on 4th call — job eventually completes", async () => {
    const redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue("OK"),
    };

    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: jest.fn() })
      .mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: jest.fn() })
      .mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: jest.fn() })
      .mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: jest.fn().mockResolvedValue(AUDIO_BYTES.buffer),
      });

    const svc = await buildModule(fetchMock, redisMock);

    // Attempts 1-3 fail (circuit not open yet — threshold is 5)
    let failed = 0;
    for (let i = 0; i < 3; i++) {
      try {
        await svc.generateAudio(PARAMS);
      } catch {
        failed++;
      }
    }
    expect(failed).toBe(3);

    // 4th call succeeds (circuit still closed — only 3 failures so far)
    const url = await svc.generateAudio(PARAMS);
    expect(url).toBe(S3_URL);
    expect(redisMock.set).toHaveBeenCalled();
  });
});
