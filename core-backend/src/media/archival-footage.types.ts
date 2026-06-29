/**
 * Shared types for the Free Archival Footage Pipeline (FEATURE-02).
 */

export type ArchivalSource = "archive.org" | "wikimedia" | "nasa";

export interface ArchivalFootageResult {
  source: ArchivalSource;
  /** Source-specific item identifier (e.g. Archive.org item ID, Wikimedia file title) */
  identifier: string;
  title: string;
  downloadUrl: string;
  format: "mp4" | "ogv" | "webm" | "mov";
  /** 0 when duration is unavailable from the source API */
  durationSeconds: number;
  /** 0 when resolution metadata is unavailable */
  width: number;
  height: number;
  /** e.g. "Public Domain", "CC BY 4.0", "CC BY-SA 4.0" */
  license: string;
  /** 0-1 relevance score assigned by SemanticRanker */
  relevanceScore: number;
}

export interface ArchivalSearchParams {
  visualPrompt: string;
  /** Skip clips shorter than this (default: 3 s) */
  minDurationSeconds?: number;
  /** Skip clips longer than this (default: unlimited) */
  maxDurationSeconds?: number;
  /** Which sources to search (default: all three) */
  sources?: ArchivalSource[];
}
