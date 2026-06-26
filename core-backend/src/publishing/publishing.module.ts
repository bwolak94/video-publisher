import { Module } from "@nestjs/common";
import { YouTubeModule } from "../youtube/youtube.module";
import { PublisherRegistry } from "./publisher.registry";
import { YouTubePublisher } from "./publishers/youtube.publisher";
import { TikTokPublisher } from "./publishers/tiktok.publisher";
import { InstagramPublisher } from "./publishers/instagram.publisher";
import { PublishingController } from "./publishing.controller";

@Module({
  imports: [YouTubeModule],
  controllers: [PublishingController],
  providers: [PublisherRegistry, YouTubePublisher, TikTokPublisher, InstagramPublisher],
  exports: [PublisherRegistry],
})
export class PublishingModule {}
