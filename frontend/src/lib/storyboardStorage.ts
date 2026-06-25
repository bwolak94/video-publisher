import { openDB } from "idb";
import type { TextOverlay } from "@/types/storyboard";
import type { SceneState } from "@/store/timelineStore";

const DB_NAME = "video-publisher";
const DB_STORE = "drafts";
const LS_PREFIX = "storyboard_draft_";
const SIZE_THRESHOLD = 100 * 1024; // 100 KB
const TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

export interface PersistedScene {
  sceneId: string;
  sequenceNumber: number;
  narrationText: string;
  visualPrompt: string;
  textOverlay: TextOverlay | null;
  isDirty: boolean;
  // NOTE: audioUrl and videoUrl intentionally omitted (pre-signed URLs expire)
}

export interface PersistedDraft {
  projectId: string;
  savedAt: number; // Unix ms timestamp
  scenes: PersistedScene[];
}

/** Strips audioUrl/videoUrl — never persisted (pre-signed URLs expire in 1h) */
export function serializeScene(scene: SceneState): PersistedScene {
  return {
    sceneId: scene.sceneId,
    sequenceNumber: scene.sequenceNumber,
    narrationText: scene.narrationText,
    visualPrompt: scene.visualPrompt,
    textOverlay: scene.textOverlay ?? null,
    isDirty: scene.isDirty,
  };
}

function lsKey(projectId: string): string {
  return `${LS_PREFIX}${projectId}`;
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    },
  });
}

/**
 * Saves draft to localStorage (<= 100KB) or IndexedDB (> 100KB).
 * Scoped by projectId — multiple projects coexist.
 */
export async function saveDraft(draft: PersistedDraft): Promise<void> {
  const serialized = JSON.stringify(draft);

  if (serialized.length > SIZE_THRESHOLD) {
    const db = await getDB();
    await db.put(DB_STORE, draft, draft.projectId);
  } else {
    localStorage.setItem(lsKey(draft.projectId), serialized);
  }
}

/**
 * Loads draft for a project.
 * Returns null if not found or TTL (72h) exceeded.
 */
export async function loadDraft(projectId: string): Promise<PersistedDraft | null> {
  let draft: PersistedDraft | null = null;

  // Try localStorage first
  const raw = localStorage.getItem(lsKey(projectId));
  if (raw) {
    try {
      draft = JSON.parse(raw) as PersistedDraft;
    } catch {
      localStorage.removeItem(lsKey(projectId));
    }
  }

  // Fallback to IndexedDB
  if (!draft) {
    try {
      const db = await getDB();
      draft = (await db.get(DB_STORE, projectId)) ?? null;
    } catch {
      // IndexedDB unavailable (SSR, private mode, etc.)
    }
  }

  if (!draft) return null;

  // TTL enforcement
  if (Date.now() - draft.savedAt > TTL_MS) {
    await clearDraft(projectId);
    return null;
  }

  return draft;
}

/**
 * Removes draft from both localStorage and IndexedDB.
 */
export async function clearDraft(projectId: string): Promise<void> {
  localStorage.removeItem(lsKey(projectId));
  try {
    const db = await getDB();
    await db.delete(DB_STORE, projectId);
  } catch {
    // ignore
  }
}

/**
 * Returns true when the server's updatedAt timestamp is newer than the local draft.
 * Used to trigger the conflict warning in the restore banner.
 */
export function isServerNewer(draft: PersistedDraft, serverUpdatedAt: number): boolean {
  return serverUpdatedAt > draft.savedAt;
}
