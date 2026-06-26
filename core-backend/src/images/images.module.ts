import { Module } from "@nestjs/common";
import { ImageCacheService } from "./image-cache.service";
import { PromptSafetyService, OPENAI_HTTP } from "./prompt-safety.service";
import { DallE3Service, DALLE_HTTP } from "./dalle3.service";
import { StableDiffusionService, SD_HTTP } from "./stable-diffusion.service";
import { ImageAssetService } from "./image-asset.service";

@Module({
  providers: [
    ImageCacheService,
    ImageAssetService,
    PromptSafetyService,
    { provide: OPENAI_HTTP, useValue: fetch },
    DallE3Service,
    { provide: DALLE_HTTP, useValue: fetch },
    StableDiffusionService,
    { provide: SD_HTTP, useValue: fetch },
  ],
  exports: [ImageAssetService, DallE3Service],
})
export class ImagesModule {}
