import { Module } from "@nestjs/common";
import { NarrationVariantsService } from "./narration-variants.service";
import { NarrationVariantsController } from "./narration-variants.controller";

@Module({
  controllers: [NarrationVariantsController],
  providers: [NarrationVariantsService],
  exports: [NarrationVariantsService],
})
export class NarrationVariantsModule {}
