import { Injectable } from "@nestjs/common";
import pino from "pino";
import { VideoProviderRegistry } from "./video-provider-registry";

const logger = pino({ level: "info" });

export interface GenerateVideoParams {
  visualPrompt: string;
  aspectRatio?: "16:9" | "9:16";
  sceneId: string;
  /** S3: Reference image URL for visual conditioning (passed through to provider) */
  referenceImageUrl?: string | null;
}

export interface GenerateVideoResult {
  /** Permanent s3:// URL */
  s3Url: string;
  /** Provider name that generated this clip */
  provider: string;
}

@Injectable()
export class VideoAssetService {
  constructor(private readonly registry: VideoProviderRegistry) {}

  /**
   * Generate a video asset for a scene.
   * Delegates to VideoProviderRegistry which scores all available providers,
   * tries them in order, and falls through on failure.
   * Returns s3:// URL + the provider name used (for cost tracking & display).
   */
  async generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
    const { visualPrompt, aspectRatio = "16:9", sceneId } = params;

    logger.info({ sceneId, visualPrompt: visualPrompt.slice(0, 80) }, "Video generation requested");

    const result = await this.registry.generate({ visualPrompt, aspectRatio, sceneId, referenceImageUrl: params.referenceImageUrl });

    logger.info({ sceneId, provider: result.provider, s3Url: result.s3Url }, "Video generation complete");
    return result;
  }

  /** Expose registry status for health/debug endpoints */
  async getProviderStatus() {
    return this.registry.getProviderStatus();
  }
}
