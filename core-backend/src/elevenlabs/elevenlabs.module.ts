import { Module } from "@nestjs/common";
import { ElevenLabsService, ELEVENLABS_HTTP } from "./elevenlabs.service";
import { AudioCacheService } from "./audio-cache.service";
import { TtsProviderRegistry } from "./tts-provider-registry";
import { VoiceCloningService, VOICE_CLONE_HTTP } from "./voice-cloning.service";
import { VoicesController } from "./voices.controller";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SettingsModule],
  controllers: [VoicesController],
  providers: [
    AudioCacheService,
    ElevenLabsService,
    TtsProviderRegistry,
    VoiceCloningService,
    { provide: ELEVENLABS_HTTP, useValue: fetch },
    { provide: VOICE_CLONE_HTTP, useValue: fetch },
  ],
  exports: [ElevenLabsService, AudioCacheService, TtsProviderRegistry, VoiceCloningService],
})
export class ElevenLabsModule {}
