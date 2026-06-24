import { Injectable } from "@nestjs/common";
import pino from "pino";
import { RunwayService } from "./runway.service";
import { PexelsService } from "./pexels.service";

const logger = pino({ level: "info" });

export interface GenerateVideoParams {
  visualPrompt: string;
  aspectRatio?: "16:9" | "9:16";
  sceneId: string;
}

@Injectable()
export class VideoAssetService {
  constructor(
    private readonly runway: RunwayService,
    private readonly pexels: PexelsService
  ) {}

  /**
   * Generate a video asset for a scene.
   * Tries Runway first; falls back to Pexels on any failure.
   * Returns s3:// URL or throws a structured error (UC-04).
   */
  async generateVideo(params: GenerateVideoParams): Promise<string> {
    const { visualPrompt, aspectRatio = "16:9", sceneId } = params;

    try {
      return await this.runway.generateVideo({ visualPrompt });
    } catch (runwayErr: any) {
      logger.warn(
        { sceneId, error: runwayErr.message, code: runwayErr.code },
        "Runway failed, falling back to Pexels"
      );
    }

    try {
      return await this.pexels.searchAndDownload(visualPrompt, aspectRatio);
    } catch (pexelsErr: any) {
      logger.error(
        { sceneId, error: pexelsErr.message },
        "Both Runway and Pexels failed"
      );
      const err: any = new Error("asset_generation_failed");
      err.error = "asset_generation_failed";
      err.sceneId = sceneId;
      err.reason = pexelsErr.message;
      throw err;
    }
  }
}
