import type { MusicGenerateParams, MusicTrack, MusicProviderName } from "./music.types";

export interface MusicProviderScores {
  /** 1-5: output quality (5 = best) */
  quality: number;
  /** 1-5: cost (5 = free, 1 = expensive) */
  cost: number;
  /** 1-5: historical reliability (5 = most reliable) */
  reliability: number;
  /** 1-5: generation/retrieval speed (5 = fastest) */
  latency: number;
}

/**
 * Common interface for all music providers.
 * Composite score = quality×4 + cost×1 + reliability×2 + latency×1
 * (quality weighted highest — bad music ruins the video).
 */
export interface MusicProvider {
  readonly name: MusicProviderName;
  readonly scores: MusicProviderScores;

  /**
   * Returns true if this provider has valid credentials or is otherwise ready.
   * Called by the registry before scoring — unconfigured providers are skipped.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Retrieve or generate a music track for the given params.
   * Must return a permanent s3:// URL (never a temp CDN link).
   */
  generate(params: MusicGenerateParams): Promise<MusicTrack>;
}
