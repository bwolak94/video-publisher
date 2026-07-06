/**
 * Unit tests for AvatarService + AvatarProviderRegistry (FEATURE-11)
 * UT-11-01..06
 */
import { Test } from "@nestjs/testing";
import { AvatarService } from "./avatar.service";
import { AvatarProviderRegistry } from "./avatar-provider-registry";
import { DRIZZLE } from "../db/db.module";
import type { AvatarProvider } from "./avatar-provider.interface";

// ── Helpers ────────────────────────────────────────────────────────────────

const SCENE_ID = "scene-1";
const PROJECT_ID = "proj-1";
const AUDIO_URL = "s3://bucket/audio.mp3";
const IMAGE_URL = "s3://bucket/avatar.jpg";
const GENERATED_URL = "s3://bucket/avatar/result.mp4";

function makeProvider(
  name: AvatarProvider["name"],
  scores: AvatarProvider["scores"],
  available = true,
  result = GENERATED_URL,
): AvatarProvider {
  return {
    name,
    scores,
    isAvailable: jest.fn().mockResolvedValue(available),
    generate: jest.fn().mockResolvedValue(result),
  };
}

function makeStoryboard(audioUrl?: string) {
  return {
    meta: { title: "T", aspectRatio: "16:9", language: "en", voiceId: "v1" },
    timeline: [
      {
        sceneId: SCENE_ID,
        sequenceNumber: 1,
        narrationText: "Hello",
        visualPrompt: "sky",
        audioUrl,
      },
    ],
  };
}

function makeDbMock(storyboard: any) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { id: PROJECT_ID, storyboard },
          ]),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

async function buildService(db: any, registry: AvatarProviderRegistry) {
  const module = await Test.createTestingModule({
    providers: [
      AvatarService,
      { provide: DRIZZLE, useValue: db },
      { provide: AvatarProviderRegistry, useValue: registry },
    ],
  }).compile();
  return module.get(AvatarService);
}

// ── UT-11-01: AvatarService routes to the requested provider ──────────────

it("UT-11-01: routes to the preferred provider and returns s3 URL + provider name", async () => {
  const wav2lip = makeProvider("wav2lip_local", { quality: 3, cost: 5, reliability: 3, latency: 4 });
  const registry = new AvatarProviderRegistry();
  registry.register(wav2lip);

  const db = makeDbMock(makeStoryboard(AUDIO_URL));
  const svc = await buildService(db, registry);

  const result = await svc.generateAvatar({
    sceneId: SCENE_ID,
    projectId: PROJECT_ID,
    avatarConfig: { provider: "wav2lip_local", avatarImageUrl: IMAGE_URL },
  });

  expect(result.videoUrl).toBe(GENERATED_URL);
  expect(result.provider).toBe("wav2lip_local");
});

// ── UT-11-02: AvatarService throws when scene has no audioUrl ─────────────

it("UT-11-02: throws when scene has no audioUrl", async () => {
  const registry = new AvatarProviderRegistry();
  const db = makeDbMock(makeStoryboard(undefined));
  const svc = await buildService(db, registry);

  await expect(
    svc.generateAvatar({
      sceneId: SCENE_ID,
      projectId: PROJECT_ID,
      avatarConfig: { provider: "wav2lip_local", avatarImageUrl: IMAGE_URL },
    }),
  ).rejects.toThrow("no audioUrl");
});

// ── UT-11-03: AvatarProviderRegistry composite score sorting ──────────────

describe("AvatarProviderRegistry scoring", () => {
  it("UT-11-03: selects provider with highest composite score", async () => {
    const wav2lip = makeProvider("wav2lip_local", { quality: 3, cost: 5, reliability: 3, latency: 4 }); // 29
    const heygen  = makeProvider("heygen",        { quality: 5, cost: 1, reliability: 4, latency: 2 }); // 27
    const did     = makeProvider("did",           { quality: 4, cost: 2, reliability: 4, latency: 2 }); // 26

    const registry = new AvatarProviderRegistry();
    registry.register(heygen);
    registry.register(did);
    registry.register(wav2lip);

    const result = await registry.generate({ audioUrl: AUDIO_URL, imageUrl: IMAGE_URL, sceneId: SCENE_ID });

    // wav2lip has the highest composite score → should be called
    expect(wav2lip.generate).toHaveBeenCalled();
    expect(heygen.generate).not.toHaveBeenCalled();
    expect(result.provider).toBe("wav2lip_local");
  });

  it("UT-11-04: falls back to next provider when first fails", async () => {
    const wav2lip = makeProvider("wav2lip_local", { quality: 3, cost: 5, reliability: 3, latency: 4 });
    (wav2lip.generate as jest.Mock).mockRejectedValue(new Error("subprocess failed"));

    const heygen = makeProvider("heygen", { quality: 5, cost: 1, reliability: 4, latency: 2 });

    const registry = new AvatarProviderRegistry();
    registry.register(wav2lip);
    registry.register(heygen);

    const result = await registry.generate({ audioUrl: AUDIO_URL, imageUrl: IMAGE_URL, sceneId: SCENE_ID });

    expect(heygen.generate).toHaveBeenCalled();
    expect(result.provider).toBe("heygen");
  });

  it("UT-11-05: preferred provider is prioritized regardless of score", async () => {
    const wav2lip = makeProvider("wav2lip_local", { quality: 3, cost: 5, reliability: 3, latency: 4 }); // score 29
    const heygen  = makeProvider("heygen",        { quality: 5, cost: 1, reliability: 4, latency: 2 }); // score 27

    const registry = new AvatarProviderRegistry();
    registry.register(wav2lip);
    registry.register(heygen);

    // explicitly request heygen even though wav2lip has higher score
    const result = await registry.generate({
      audioUrl: AUDIO_URL,
      imageUrl: IMAGE_URL,
      sceneId: SCENE_ID,
      preferredProvider: "heygen",
    });

    expect(heygen.generate).toHaveBeenCalled();
    expect(result.provider).toBe("heygen");
  });

  it("UT-11-06: throws when all providers fail", async () => {
    const p1 = makeProvider("wav2lip_local", { quality: 3, cost: 5, reliability: 3, latency: 4 });
    (p1.generate as jest.Mock).mockRejectedValue(new Error("no GPU"));

    const registry = new AvatarProviderRegistry();
    registry.register(p1);

    await expect(
      registry.generate({ audioUrl: AUDIO_URL, imageUrl: IMAGE_URL, sceneId: SCENE_ID }),
    ).rejects.toThrow("All avatar providers failed");
  });
});
