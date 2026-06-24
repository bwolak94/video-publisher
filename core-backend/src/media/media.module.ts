import { Module } from "@nestjs/common";
import { VideoCacheService } from "./video-cache.service";
import { RunwayService, RUNWAY_HTTP } from "./runway.service";
import { PexelsService, PEXELS_HTTP } from "./pexels.service";
import { VideoAssetService } from "./video-asset.service";

@Module({
  providers: [
    VideoCacheService,
    VideoAssetService,
    RunwayService,
    { provide: RUNWAY_HTTP, useValue: fetch },
    PexelsService,
    { provide: PEXELS_HTTP, useValue: fetch },
  ],
  exports: [VideoAssetService, VideoCacheService],
})
export class MediaModule {}
