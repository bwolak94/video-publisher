import { Module, OnModuleInit } from "@nestjs/common";
import { VideoCacheService } from "./video-cache.service";
import { RunwayService, RUNWAY_HTTP } from "./runway.service";
import { PexelsService, PEXELS_HTTP } from "./pexels.service";
import { KlingService, KLING_HTTP } from "./kling.service";
import { ArchivalFootageService, ARCHIVAL_HTTP } from "./archival-footage.service";
import { RunwayProvider } from "./runway-provider";
import { PexelsProvider } from "./pexels-provider";
import { VideoProviderRegistry } from "./video-provider-registry";
import { VideoAssetService } from "./video-asset.service";
import { SettingsModule } from "../settings/settings.module";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [SettingsModule, MetricsModule],
  providers: [
    VideoCacheService,

    // ── Raw provider services ────────────────────────────────────────────────
    RunwayService,
    { provide: RUNWAY_HTTP, useValue: fetch },
    PexelsService,
    { provide: PEXELS_HTTP, useValue: fetch },
    KlingService,
    { provide: KLING_HTTP, useValue: fetch },
    ArchivalFootageService,
    { provide: ARCHIVAL_HTTP, useValue: fetch },

    // ── VideoProvider adapters ───────────────────────────────────────────────
    RunwayProvider,
    PexelsProvider,

    // ── Registry + orchestrator ──────────────────────────────────────────────
    VideoProviderRegistry,
    VideoAssetService,
  ],
  exports: [VideoAssetService, VideoCacheService, VideoProviderRegistry],
})
export class MediaModule implements OnModuleInit {
  constructor(
    private readonly registry: VideoProviderRegistry,
    private readonly runway: RunwayProvider,
    private readonly pexels: PexelsProvider,
    private readonly kling: KlingService,
    private readonly archival: ArchivalFootageService,
  ) {}

  /**
   * Register all providers after DI is ready.
   * Order here is a fallback order — the registry re-ranks by score at runtime.
   */
  onModuleInit() {
    this.registry.register(this.runway);   // quality=5, cost=1
    this.registry.register(this.kling);    // quality=5, cost=2
    this.registry.register(this.pexels);   // quality=3, cost=4
    this.registry.register(this.archival); // quality=3, cost=5 (free)
  }
}
