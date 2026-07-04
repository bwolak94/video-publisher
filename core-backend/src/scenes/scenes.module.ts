import { Module, forwardRef } from "@nestjs/common";
import { ScenesController } from "./scenes.controller";
import { ScenesService } from "./scenes.service";
import { MediaModule } from "../media/media.module";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";
import { CostModule } from "../cost/cost.module";
import { GatewayModule } from "../gateway/gateway.module";

@Module({
  imports: [MediaModule, ElevenLabsModule, CostModule, forwardRef(() => GatewayModule)],
  controllers: [ScenesController],
  providers: [ScenesService],
  exports: [ScenesService],
})
export class ScenesModule {}
