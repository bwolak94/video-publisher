import { Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { VideoAnalyticsService } from "./video-analytics.service";

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, VideoAnalyticsService],
  exports: [MetricsService, VideoAnalyticsService],
})
export class MetricsModule {}
