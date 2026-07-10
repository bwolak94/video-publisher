import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottleGuard } from "./common/throttle.guard";
import { ScheduleModule } from "@nestjs/schedule";
import { DbModule } from "./db/db.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { QueueModule } from "./queue/queue.module";
import { HealthModule } from "./health/health.module";
import { GatewayModule } from "./gateway/gateway.module";
import { ElevenLabsModule } from "./elevenlabs/elevenlabs.module";
import { MediaModule } from "./media/media.module";
import { ImagesModule } from "./images/images.module";
import { StorageModule } from "./storage/storage.module";
import { WorkerModeModule } from "./worker-mode/worker-mode.module";
import { YouTubeModule } from "./youtube/youtube.module";
import { CostModule } from "./cost/cost.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AlertsModule } from "./alerts/alerts.module";
import { SettingsModule } from "./settings/settings.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { PublishingModule } from "./publishing/publishing.module";
import { ThumbnailsModule } from "./thumbnails/thumbnails.module";
import { CreatorModule } from "./creator/creator.module";
import { ScenesModule } from "./scenes/scenes.module";
import { SubtitlesModule } from "./subtitles/subtitles.module";
import { MusicModule } from "./music/music.module";
import { LocalizationModule } from "./localization/localization.module";
import { AvatarModule } from "./avatar/avatar.module";
import { TemplatesModule } from "./storyboard/templates.module";
import { BrandKitModule } from "./brand-kit/brand-kit.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ReviewModule } from "./review/review.module";

@Module({
  providers: [{ provide: APP_GUARD, useClass: ThrottleGuard }],
  imports: [
    ScheduleModule.forRoot(),
    DbModule,
    RedisModule,
    StorageModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    QueueModule,
    GatewayModule,
    ElevenLabsModule,
    MediaModule,
    ImagesModule,
    WorkerModeModule,
    YouTubeModule,
    CostModule,
    MetricsModule,
    AlertsModule,
    SettingsModule,
    WebhooksModule,
    PublishingModule,
    ThumbnailsModule,
    CreatorModule,
    ScenesModule,
    SubtitlesModule,
    MusicModule,
    LocalizationModule,
    AvatarModule,
    TemplatesModule,
    BrandKitModule,
    AnalyticsModule,
    ReviewModule,
  ],
})
export class AppModule {}
