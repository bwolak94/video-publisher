/**
 * Unit tests for LocalizationService (FEATURE-10) — UT-10-01..05
 */
import { Test } from "@nestjs/testing";
import { LocalizationService, OPENAI_TRANSLATE_HTTP } from "./localization.service";
import { DRIZZLE } from "../db/db.module";
import { SettingsService } from "../settings/settings.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const STORYBOARD: VideoStoryboard = {
  meta: {
    title: "Test Video",
    aspectRatio: "16:9",
    language: "en",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
  },
  timeline: [
    { sceneId: "s1", sequenceNumber: 1, narrationText: "Hello world", visualPrompt: "sky", audioUrl: "s3://b/a.mp3", audioCacheKey: "abc" },
    { sceneId: "s2", sequenceNumber: 2, narrationText: "Goodbye world", visualPrompt: "night", audioUrl: "s3://b/b.mp3" },
  ],
};

function makeTranslationResponse(translations: string[]) {
  return {
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify(translations) } }],
    }),
  };
}

async function buildService(httpFetch: jest.Mock, dbMock?: any) {
  const db = dbMock ?? {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: "child-project-id" }]),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ id: "orig-id", storyboard: STORYBOARD, title: "Test Video" }]),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  };

  const settings = { getPlaintext: jest.fn().mockResolvedValue("test-key") };

  const module = await Test.createTestingModule({
    providers: [
      LocalizationService,
      { provide: DRIZZLE, useValue: db },
      { provide: OPENAI_TRANSLATE_HTTP, useValue: httpFetch },
      { provide: SettingsService, useValue: settings },
    ],
  }).compile();

  return module.get(LocalizationService);
}

// ── UT-10-01: translateStoryboard clears audioUrl and audioCacheKey ──────────

describe("LocalizationService.translateStoryboard()", () => {
  it("UT-10-01: clears audioUrl and audioCacheKey from every scene", async () => {
    const http = jest.fn().mockResolvedValue(
      makeTranslationResponse(["Hallo Welt", "Auf Wiedersehen Welt"]),
    );
    const svc = await buildService(http);

    const result = await svc.translateStoryboard(STORYBOARD, "de");

    for (const scene of result.timeline) {
      expect(scene.audioUrl).toBeUndefined();
      expect(scene.audioCacheKey).toBeUndefined();
    }
  });

  it("UT-10-02: updates meta.language to targetLanguage", async () => {
    const http = jest.fn().mockResolvedValue(
      makeTranslationResponse(["Hallo Welt", "Auf Wiedersehen Welt"]),
    );
    const svc = await buildService(http);

    const result = await svc.translateStoryboard(STORYBOARD, "de");

    expect(result.meta.language).toBe("de");
  });

  it("UT-10-03: translated narrationTexts come from API response", async () => {
    const http = jest.fn().mockResolvedValue(
      makeTranslationResponse(["Bonjour le monde", "Au revoir le monde"]),
    );
    const svc = await buildService(http);

    const result = await svc.translateStoryboard(STORYBOARD, "fr");

    expect(result.timeline[0].narrationText).toBe("Bonjour le monde");
    expect(result.timeline[1].narrationText).toBe("Au revoir le monde");
  });

  it("UT-10-04: falls back to original texts on OpenAI parse error", async () => {
    const http = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "not json" } }] }),
    });
    const svc = await buildService(http);

    const result = await svc.translateStoryboard(STORYBOARD, "pl");

    expect(result.timeline[0].narrationText).toBe("Hello world");
    expect(result.timeline[1].narrationText).toBe("Goodbye world");
  });

  it("UT-10-05: empty storyboard returns immediately without calling OpenAI", async () => {
    const http = jest.fn();
    const svc = await buildService(http);

    const empty: VideoStoryboard = { ...STORYBOARD, timeline: [] };
    await svc.translateStoryboard(empty, "de");

    expect(http).not.toHaveBeenCalled();
  });
});

// ── UT-10-06: createLocalizedProject inserts a child project row ────────────

describe("LocalizationService.createLocalizedProject()", () => {
  it("UT-10-06: inserts project with isLocalization=true and returns its id", async () => {
    const insertMock = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: "child-abc" }]),
      }),
    });
    const db = {
      insert: insertMock,
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }) }),
      update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    };
    const http = jest.fn();
    const svc = await buildService(http, db);

    const id = await svc.createLocalizedProject("orig-id", STORYBOARD, "de", "Test [DE]");

    expect(id).toBe("child-abc");
    const insertedValues = insertMock.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.isLocalization).toBe(true);
    expect(insertedValues.parentProjectId).toBe("orig-id");
    expect(insertedValues.language).toBe("de");
  });
});
