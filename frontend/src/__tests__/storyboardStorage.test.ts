/**
 * Unit tests for storyboard persistence — UT-21-01..08
 */
import {
  serializeScene,
  saveDraft,
  loadDraft,
  isServerNewer,
  type PersistedDraft,
} from "@/lib/storyboardStorage";
import type { SceneState } from "@/store/timelineStore";

// ── Mock idb (IndexedDB not available in jsdom) ───────────────────────────────
// Factory must not reference outer variables (jest.mock is hoisted)
jest.mock("idb", () => ({
  openDB: jest.fn(),
}));

import { openDB } from "idb";

// Mock DB object reused across tests
const mockDB = {
  put: jest.fn<Promise<void>, [string, unknown, string]>().mockResolvedValue(undefined),
  get: jest.fn<Promise<unknown>, [string, string]>().mockResolvedValue(undefined),
  delete: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined),
  objectStoreNames: { contains: jest.fn().mockReturnValue(true) },
};

const baseScene: SceneState = {
  sceneId: "s1",
  sequenceNumber: 1,
  durationInSeconds: 5,
  narrationText: "Hello world",
  visualPrompt: "A beautiful sunset",
  audioUrl: "https://s3.example.com/audio/s1.mp3",
  audioCacheKey: "abc123",
  videoUrl: "https://s3.example.com/video/s1.mp4",
  visualCacheKey: "def456",
  isDirty: true,
  narrationDirty: true,
  visualDirty: false,
  committedNarrationText: "Hello",
  committedVisualPrompt: "A beautiful sunset",
  status: "idle",
  textOverlay: null,
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  // Set up openDB mock after clearAllMocks
  (openDB as jest.Mock).mockResolvedValue(mockDB);
  mockDB.put.mockResolvedValue(undefined);
  mockDB.get.mockResolvedValue(undefined);
  mockDB.delete.mockResolvedValue(undefined);
});

// UT-21-01: Serializer strips audioUrl from persisted scene
it("serializeScene strips audioUrl (UT-21-01)", () => {
  const result = serializeScene(baseScene);
  expect(result).not.toHaveProperty("audioUrl");
});

// UT-21-02: Serializer strips videoUrl from persisted scene
it("serializeScene strips videoUrl (UT-21-02)", () => {
  const result = serializeScene(baseScene);
  expect(result).not.toHaveProperty("videoUrl");
});

// UT-21-03: Draft size < 100KB → localStorage.setItem called
it("saveDraft uses localStorage when serialized draft < 100KB (UT-21-03)", async () => {
  const lsSetSpy = jest.spyOn(Storage.prototype, "setItem");

  const draft: PersistedDraft = {
    projectId: "proj-123",
    savedAt: Date.now(),
    scenes: [serializeScene(baseScene)],
  };

  await saveDraft(draft);

  expect(lsSetSpy).toHaveBeenCalledWith(
    "storyboard_draft_proj-123",
    expect.any(String)
  );
  expect(mockDB.put).not.toHaveBeenCalled();
});

// UT-21-04: Draft size > 100KB → IndexedDB put called
it("saveDraft uses IndexedDB when serialized draft > 100KB (UT-21-04)", async () => {
  const lsSetSpy = jest.spyOn(Storage.prototype, "setItem");

  // Pad narrationText to produce > 100KB
  const bigScene = serializeScene({
    ...baseScene,
    narrationText: "A".repeat(110 * 1024),
  });

  const draft: PersistedDraft = {
    projectId: "proj-large",
    savedAt: Date.now(),
    scenes: [bigScene],
  };

  await saveDraft(draft);

  expect(mockDB.put).toHaveBeenCalledWith("drafts", draft, "proj-large");
  expect(lsSetSpy).not.toHaveBeenCalled();
});

// UT-21-05: TTL expired (96h old) → loadDraft returns null
it("loadDraft returns null when draft is older than 72h (UT-21-05)", async () => {
  const expiredDraft: PersistedDraft = {
    projectId: "proj-old",
    savedAt: Date.now() - 96 * 60 * 60 * 1000,
    scenes: [],
  };

  localStorage.setItem(
    "storyboard_draft_proj-old",
    JSON.stringify(expiredDraft)
  );

  const result = await loadDraft("proj-old");
  expect(result).toBeNull();
  expect(localStorage.getItem("storyboard_draft_proj-old")).toBeNull();
});

// UT-21-06: TTL valid (24h old) → loadDraft returns draft object
it("loadDraft returns draft when savedAt is within 72h (UT-21-06)", async () => {
  const validDraft: PersistedDraft = {
    projectId: "proj-recent",
    savedAt: Date.now() - 24 * 60 * 60 * 1000,
    scenes: [serializeScene(baseScene)],
  };

  localStorage.setItem(
    "storyboard_draft_proj-recent",
    JSON.stringify(validDraft)
  );

  const result = await loadDraft("proj-recent");
  expect(result).not.toBeNull();
  expect(result?.projectId).toBe("proj-recent");
});

// UT-21-07: savedAt newer than serverUpdatedAt → conflict NOT flagged
it("isServerNewer returns false when draft savedAt is newer (UT-21-07)", () => {
  const now = Date.now();
  const draft: PersistedDraft = { projectId: "p", savedAt: now, scenes: [] };
  expect(isServerNewer(draft, now - 30 * 60 * 1000)).toBe(false);
});

// UT-21-08: savedAt older than serverUpdatedAt → conflict flagged
it("isServerNewer returns true when serverUpdatedAt is newer (UT-21-08)", () => {
  const now = Date.now();
  const draft: PersistedDraft = {
    projectId: "p",
    savedAt: now - 60 * 60 * 1000,
    scenes: [],
  };
  expect(isServerNewer(draft, now - 30 * 60 * 1000)).toBe(true);
});
