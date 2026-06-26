import { Injectable } from "@nestjs/common";
import type { Platform, VideoPublisher } from "./video-publisher.interface";
import { YouTubePublisher } from "./publishers/youtube.publisher";
import { TikTokPublisher } from "./publishers/tiktok.publisher";
import { InstagramPublisher } from "./publishers/instagram.publisher";

@Injectable()
export class PublisherRegistry {
  private readonly map: Map<Platform, VideoPublisher>;

  constructor(
    youtube: YouTubePublisher,
    tiktok: TikTokPublisher,
    instagram: InstagramPublisher
  ) {
    this.map = new Map<Platform, VideoPublisher>([
      ["youtube", youtube],
      ["tiktok", tiktok],
      ["instagram", instagram],
    ]);
  }

  get(platform: Platform): VideoPublisher {
    const publisher = this.map.get(platform);
    if (!publisher) throw new Error(`No publisher registered for platform: ${platform}`);
    return publisher;
  }
}
