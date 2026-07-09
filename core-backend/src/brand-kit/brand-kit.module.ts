import { Module } from "@nestjs/common";
import { BrandKitService } from "./brand-kit.service";
import { BrandKitController } from "./brand-kit.controller";

@Module({
  controllers: [BrandKitController],
  providers: [BrandKitService],
  exports: [BrandKitService],
})
export class BrandKitModule {}
