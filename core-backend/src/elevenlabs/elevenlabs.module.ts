import { Module } from "@nestjs/common";
import { ElevenLabsService, ELEVENLABS_HTTP } from "./elevenlabs.service";
import { AudioCacheService } from "./audio-cache.service";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SettingsModule],
  providers: [
    AudioCacheService,
    ElevenLabsService,
    {
      provide: ELEVENLABS_HTTP,
      useValue: fetch, // native Node 22 fetch
    },
  ],
  exports: [ElevenLabsService, AudioCacheService],
})
export class ElevenLabsModule {}
