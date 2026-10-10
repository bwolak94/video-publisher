import { Module } from "@nestjs/common";
import { SfxController } from "./sfx.controller";
import { SfxService } from "./sfx.service";

@Module({
  controllers: [SfxController],
  providers: [SfxService],
  exports: [SfxService],
})
export class SfxModule {}
