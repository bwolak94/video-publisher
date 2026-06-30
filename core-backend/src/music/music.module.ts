import { Module, OnModuleInit } from "@nestjs/common";
import { JamendoMusicService, JAMENDO_HTTP } from "./jamendo-music.service";
import { StabilityAudioService, STABILITY_AUDIO_HTTP } from "./stability-audio.service";
import { EmbeddedTracksService } from "./embedded-tracks.service";
import { MusicProviderRegistry } from "./music-provider-registry";
import { MusicCacheService } from "./music-cache.service";
import { MusicService } from "./music.service";
import { MusicController } from "./music.controller";
import { SettingsModule } from "../settings/settings.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [SettingsModule, StorageModule],
  providers: [
    // ── Provider implementations ───────────────────────────────────────────
    JamendoMusicService,
    { provide: JAMENDO_HTTP, useValue: fetch },
    StabilityAudioService,
    { provide: STABILITY_AUDIO_HTTP, useValue: fetch },
    EmbeddedTracksService,

    // ── Registry + orchestration ───────────────────────────────────────────
    MusicProviderRegistry,
    MusicCacheService,
    MusicService,
  ],
  controllers: [MusicController],
  exports: [MusicService],
})
export class MusicModule implements OnModuleInit {
  constructor(
    private readonly registry: MusicProviderRegistry,
    private readonly stability: StabilityAudioService,
    private readonly jamendo: JamendoMusicService,
    private readonly embedded: EmbeddedTracksService,
  ) {}

  onModuleInit() {
    // Register in score order: Stability (33) > Jamendo (31) > Embedded (28)
    this.registry.register(this.stability);
    this.registry.register(this.jamendo);
    this.registry.register(this.embedded);
  }
}
