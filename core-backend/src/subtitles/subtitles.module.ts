import { Module, OnModuleInit } from "@nestjs/common";
import { WhisperLocalService, WHISPER_LOCAL_HTTP } from "./whisper-local.service";
import { WhisperApiService, WHISPER_API_HTTP } from "./whisper-api.service";
import { WhisperProviderRegistry } from "./whisper-provider-registry";
import { SubtitleCacheService } from "./subtitle-cache.service";
import { SubtitleService } from "./subtitle.service";
import { SubtitlesController } from "./subtitles.controller";
import { SettingsModule } from "../settings/settings.module";
import { StorageModule } from "../storage/storage.module";
import { ScenesModule } from "../scenes/scenes.module";

@Module({
  imports: [SettingsModule, StorageModule, ScenesModule],
  providers: [
    // ── Providers ──────────────────────────────────────────────────────────
    WhisperLocalService,
    { provide: WHISPER_LOCAL_HTTP, useValue: fetch },
    WhisperApiService,
    { provide: WHISPER_API_HTTP, useValue: fetch },

    // ── Registry + orchestrator ────────────────────────────────────────────
    WhisperProviderRegistry,
    SubtitleCacheService,
    SubtitleService,
  ],
  controllers: [SubtitlesController],
  exports: [SubtitleService],
})
export class SubtitlesModule implements OnModuleInit {
  constructor(
    private readonly registry: WhisperProviderRegistry,
    private readonly local: WhisperLocalService,
    private readonly api: WhisperApiService,
  ) {}

  onModuleInit() {
    // Register in score order: local first (score=34), API second (score=33)
    this.registry.register(this.local);
    this.registry.register(this.api);
  }
}
