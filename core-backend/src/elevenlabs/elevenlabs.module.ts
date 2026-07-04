import { Module } from "@nestjs/common";
import { ElevenLabsService, ELEVENLABS_HTTP } from "./elevenlabs.service";
import { AudioCacheService } from "./audio-cache.service";
import { TtsProviderRegistry } from "./tts-provider-registry";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SettingsModule],
  providers: [
    AudioCacheService,
    ElevenLabsService,
    TtsProviderRegistry,
    {
      provide: ELEVENLABS_HTTP,
      useValue: fetch, // native Node 22 fetch
    },
  ],
  exports: [ElevenLabsService, AudioCacheService, TtsProviderRegistry],
})
export class ElevenLabsModule {}
