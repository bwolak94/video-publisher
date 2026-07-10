import { Module, forwardRef } from "@nestjs/common";
import { ScenesController } from "./scenes.controller";
import { ScenesService } from "./scenes.service";
import { WaveformService } from "./waveform.service";
import { MediaModule } from "../media/media.module";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";
import { CostModule } from "../cost/cost.module";
import { GatewayModule } from "../gateway/gateway.module";

@Module({
  imports: [MediaModule, ElevenLabsModule, CostModule, forwardRef(() => GatewayModule)],
  controllers: [ScenesController],
  providers: [ScenesService, WaveformService],
  exports: [ScenesService],
})
export class ScenesModule {}
