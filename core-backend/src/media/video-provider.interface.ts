/**
 * Common interface for all video generation providers.
 * Every provider must implement this contract so VideoProviderRegistry
 * can score and select them uniformly.
 */

export interface VideoGenerateParams {
  visualPrompt: string;
  aspectRatio?: "16:9" | "9:16";
  sceneId: string;
}

export interface ProviderScores {
  /** 1-5: output quality (5 = best) */
  quality: number;
  /** 1-5: cost (5 = free, 1 = expensive) */
  cost: number;
  /** 1-5: historical reliability (5 = most reliable) */
  reliability: number;
  /** 1-5: generation speed (5 = fastest) */
  latency: number;
}

export interface VideoProvider {
  /** Unique provider name used in logs, metrics, and DB */
  readonly name: string;
  readonly scores: ProviderScores;

  /**
   * Returns true if this provider has a valid API key / credentials configured.
   * Called by the registry before scoring — unconfigured providers are skipped.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generate a video clip for the given scene.
   * Must return a permanent s3:// URL (never a CDN temp URL).
   */
  generate(params: VideoGenerateParams): Promise<string>;
}
