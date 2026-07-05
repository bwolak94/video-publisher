import { Module } from "@nestjs/common";
import { LocalizationController } from "./localization.controller";
import { LocalizationService, OPENAI_TRANSLATE_HTTP } from "./localization.service";
import { DubbingService } from "./dubbing.service";
import { LocalizationWorker } from "./localization.worker";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";
import { QueueModule } from "../queue/queue.module";
import { SettingsModule } from "../settings/settings.module";
import { GatewayModule } from "../gateway/gateway.module";

@Module({
  imports: [ElevenLabsModule, QueueModule, SettingsModule, GatewayModule],
  controllers: [LocalizationController],
  providers: [
    {
      provide: OPENAI_TRANSLATE_HTTP,
      useValue: fetch,
    },
    LocalizationService,
    DubbingService,
    LocalizationWorker,
  ],
  exports: [LocalizationService, DubbingService],
})
export class LocalizationModule {}
