import { Module } from "@nestjs/common";
import { YouTubeModule } from "../youtube/youtube.module";
import { SettingsModule } from "../settings/settings.module";
import { QueueModule } from "../queue/queue.module";
import { MetricsModule } from "../metrics/metrics.module";
import { PublisherRegistry } from "./publisher.registry";
import { YouTubePublisher } from "./publishers/youtube.publisher";
import { TikTokPublisher } from "./publishers/tiktok.publisher";
import { InstagramPublisher } from "./publishers/instagram.publisher";
import { TikTokAuthService } from "./tiktok-auth.service";
import { InstagramAuthService } from "./instagram-auth.service";
import { PublishingController } from "./publishing.controller";
import { SocialAuthController } from "./social-auth.controller";
import { PublishWorker } from "../queue/workers/publish.worker";

@Module({
  imports: [YouTubeModule, SettingsModule, QueueModule, MetricsModule],
  controllers: [PublishingController, SocialAuthController],
  providers: [
    PublisherRegistry,
    YouTubePublisher,
    TikTokPublisher,
    InstagramPublisher,
    TikTokAuthService,
    InstagramAuthService,
    PublishWorker,
  ],
  exports: [PublisherRegistry, TikTokAuthService, InstagramAuthService],
})
export class PublishingModule {}
