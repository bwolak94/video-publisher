import { Injectable } from "@nestjs/common";
import pino from "pino";
import { ImageCacheService } from "./image-cache.service";
import { PromptSafetyService } from "./prompt-safety.service";
import { DallE3Service, DALLE_MODEL } from "./dalle3.service";
import { StableDiffusionService } from "./stable-diffusion.service";
import { mapAspectRatioToSize, sizeToWidthHeight } from "./resolution-mapper";

const logger = pino({ level: "info" });

export interface GenerateImageParams {
  visualPrompt: string;
  aspectRatio?: string;
  sceneId: string;
}

@Injectable()
export class ImageAssetService {
  constructor(
    private readonly cache: ImageCacheService,
    private readonly promptSafety: PromptSafetyService,
    private readonly dalle3: DallE3Service,
    private readonly sd: StableDiffusionService
  ) {}

  /**
   * Generate a static image for a scene.
   * Flow: cache → prompt safety → DALL-E 3 → [SD fallback] → s3:// URL
   */
  async generateImage(params: GenerateImageParams): Promise<string> {
    const { visualPrompt, aspectRatio = "16:9", sceneId } = params;

    const size = mapAspectRatioToSize(aspectRatio);
    const cacheKey = this.cache.computeCacheKey(visualPrompt, DALLE_MODEL, size);

    // 1. Cache check
    const cached = await this.cache.getCached(cacheKey);
    if (cached) return cached;

    // 2. Prompt safety
    const safePrompt = await this.promptSafety.safePrompt(visualPrompt);

    const s3Key = `images/${cacheKey}.png`;

    // 3. Try DALL-E 3
    let s3Url: string;
    try {
      s3Url = await this.dalle3.generateAndUpload(safePrompt, size, s3Key);
    } catch (dalleErr: any) {
      logger.warn(
        { sceneId, error: dalleErr.message },
        "DALL-E 3 failed, attempting Stable Diffusion fallback"
      );

      // 4. SD fallback — throws if SD_API_URL not set (UT-11-08)
      if (!this.sd.isAvailable()) {
        throw dalleErr;
      }

      const { width, height } = sizeToWidthHeight(size);
      s3Url = await this.sd.generateAndUpload(safePrompt, width, height, s3Key);
    }

    // 5. Write cache — only after S3 confirmed
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ sceneId, cacheKey, size }, "Image asset generated and cached");
    return s3Url;
  }
}
