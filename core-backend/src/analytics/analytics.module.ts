import { Module } from "@nestjs/common";
import { PublishAnalyticsService } from "./publish-analytics.service";
import { AnalyticsController } from "./analytics.controller";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SettingsModule],
  controllers: [AnalyticsController],
  providers: [PublishAnalyticsService],
  exports: [PublishAnalyticsService],
})
export class AnalyticsModule {}
