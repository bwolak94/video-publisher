import { Injectable } from "@nestjs/common";
import { YouTubeUploadService } from "../../youtube/youtube-upload.service";
import type { VideoPublisher, PublishOptions, PublishResult } from "../video-publisher.interface";

@Injectable()
export class YouTubePublisher implements VideoPublisher {
  readonly platform = "youtube" as const;

  constructor(private readonly uploadService: YouTubeUploadService) {}

  async upload(options: PublishOptions): Promise<PublishResult> {
    const videoId = await this.uploadService.upload({
      projectId: options.projectId,
      channelId: options.channelId,
      s3Key: options.s3Key,
      totalBytes: options.totalBytes,
      title: options.title,
      description: options.description,
      tags: options.tags,
      privacyStatus: options.privacyStatus ?? "private",
      publishAt: options.publishAt,
    });
    return {
      platform: "youtube",
      platformVideoId: videoId,
      url: `https://youtu.be/${videoId}`,
    };
  }
}
