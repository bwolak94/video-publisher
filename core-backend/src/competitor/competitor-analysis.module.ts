import { Module } from "@nestjs/common";
import { CompetitorAnalysisService } from "./competitor-analysis.service";
import { CompetitorAnalysisController } from "./competitor-analysis.controller";

@Module({
  controllers: [CompetitorAnalysisController],
  providers: [CompetitorAnalysisService],
  exports: [CompetitorAnalysisService],
})
export class CompetitorAnalysisModule {}
