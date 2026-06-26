import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { VideoPublisher, PublishOptions, PublishResult } from "../video-publisher.interface";

const logger = pino({ level: "info" });

/**
 * TikTok Content Posting API v2 publisher.
 * Requires: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET env vars.
 * OAuth2 token management is not yet implemented — this stub logs intent and throws.
 */
@Injectable()
export class TikTokPublisher implements VideoPublisher {
  readonly platform = "tiktok" as const;

  async upload(options: PublishOptions): Promise<PublishResult> {
    logger.info(
      { projectId: options.projectId, channelId: options.channelId },
      "TikTok publish requested — not yet implemented"
    );
    // TODO: implement TikTok Content Posting API v2
    // 1. POST /v2/post/publish/video/init  → upload_url + publish_id
    // 2. PUT upload_url with S3 stream
    // 3. GET /v2/post/publish/status/fetch?publish_id=... until complete
    throw new Error("TikTok publisher not yet implemented");
  }
}
