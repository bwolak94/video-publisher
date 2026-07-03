import { Module } from "@nestjs/common";
import { PreRenderValidatorService } from "./pre-render-validator.service";
import { QualityGatesService } from "./quality-gates.service";
import { StorageModule } from "../storage/storage.module";
import { DbModule } from "../db/db.module";

@Module({
  imports: [StorageModule, DbModule],
  providers: [PreRenderValidatorService, QualityGatesService],
  exports: [PreRenderValidatorService, QualityGatesService],
})
export class QualityGatesModule {}
