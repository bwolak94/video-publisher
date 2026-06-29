import { Module } from "@nestjs/common";
import { ScenesController } from "./scenes.controller";
import { ScenesService } from "./scenes.service";
import { MediaModule } from "../media/media.module";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";

@Module({
  imports: [MediaModule, ElevenLabsModule],
  controllers: [ScenesController],
  providers: [ScenesService],
})
export class ScenesModule {}
