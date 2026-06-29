/**
 * Pure SRT and VTT formatters (FEATURE-04).
 * No side effects — fully unit-testable without mocks.
 *
 * Strategy: group word-level timestamps into ~7-word subtitle entries so that
 * each SRT/VTT entry is readable (not one word per line, not one wall of text).
 */

import type { WordTimestamp } from "./subtitle.types";

const WORDS_PER_ENTRY = 7;

// ── Grouping ──────────────────────────────────────────────────────────────────

function chunkWords(words: WordTimestamp[], size: number): WordTimestamp[][] {
  const chunks: WordTimestamp[][] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size));
  }
  return chunks;
}

// ── Time formatting ───────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function pad3(n: number): string {
  return String(Math.floor(n)).padStart(3, "0");
}

/** SRT timestamp: HH:MM:SS,mmm */
function toSrtTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

/** VTT timestamp: MM:SS.mmm */
function toVttTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert word-level timestamps to SRT format string.
 * Groups consecutive words into ~WORDS_PER_ENTRY-word entries.
 */
export function toSRT(words: WordTimestamp[]): string {
  if (words.length === 0) return "";

  const groups = chunkWords(words, WORDS_PER_ENTRY);

  return groups
    .map((group, i) => {
      const start = toSrtTimestamp(group[0].start);
      const end = toSrtTimestamp(group[group.length - 1].end);
      const text = group.map((w) => w.word).join(" ").trim();
      return `${i + 1}\n${start} --> ${end}\n${text}`;
    })
    .join("\n\n");
}

/**
 * Convert word-level timestamps to WebVTT format string.
 */
export function toVTT(words: WordTimestamp[]): string {
  if (words.length === 0) return "WEBVTT\n";

  const groups = chunkWords(words, WORDS_PER_ENTRY);

  const cues = groups
    .map((group) => {
      const start = toVttTimestamp(group[0].start);
      const end = toVttTimestamp(group[group.length - 1].end);
      const text = group.map((w) => w.word).join(" ").trim();
      return `${start} --> ${end}\n${text}`;
    })
    .join("\n\n");

  return `WEBVTT\n\n${cues}`;
}
