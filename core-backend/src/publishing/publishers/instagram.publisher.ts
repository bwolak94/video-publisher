import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { VideoPublisher, PublishOptions, PublishResult } from "../video-publisher.interface";

const logger = pino({ level: "info" });

/**
 * Meta Graph API — Instagram Reels publisher.
 * Requires: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID env vars.
 * OAuth2 token management is not yet implemented — this stub logs intent and throws.
 */
@Injectable()
export class InstagramPublisher implements VideoPublisher {
  readonly platform = "instagram" as const;

  async upload(options: PublishOptions): Promise<PublishResult> {
    logger.info(
      { projectId: options.projectId, channelId: options.channelId },
      "Instagram publish requested — not yet implemented"
    );
    // TODO: implement Meta Graph API Reels upload
    // 1. POST /{ig-user-id}/media  { media_type: REELS, video_url, caption }
    // 2. Poll /{creation-id}?fields=status_code until FINISHED
    // 3. POST /{ig-user-id}/media_publish  { creation_id }
    throw new Error("Instagram publisher not yet implemented");
  }
}
