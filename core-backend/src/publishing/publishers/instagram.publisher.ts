import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { VideoPublisher, PublishOptions, PublishResult } from "../video-publisher.interface";
import { SettingsService } from "../../settings/settings.service";
import { S3Service } from "../../storage/s3.service";

const logger = pino({ level: "info" });

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 600_000; // 10 min — Instagram processing can be slow for large files
const PRESIGN_TTL_SECONDS = 3600; // 1 h — must stay accessible while Instagram downloads it

/**
 * Meta Graph API — Instagram Reels publisher.
 *
 * Auth:
 *   - instagramAccessToken  — long-lived User Access Token with instagram_content_publish scope
 *   - instagramAccountId    — numeric Instagram Business / Creator account ID
 *   Both stored in Settings → Integrations.
 *
 * Flow:
 *   1. Generate a pre-signed S3 URL for the video (Instagram needs HTTPS)
 *   2. POST /{ig-account-id}/media   { media_type: REELS, video_url, caption }  → creation_id
 *   3. Poll  /{creation-id}?fields=status_code  until status_code === "FINISHED"
 *   4. POST /{ig-account-id}/media_publish   { creation_id }  → ig_media_id
 */
@Injectable()
export class InstagramPublisher implements VideoPublisher {
  readonly platform = "instagram" as const;

  constructor(
    private readonly settings: SettingsService,
    private readonly s3: S3Service,
  ) {}

  async upload(options: PublishOptions): Promise<PublishResult> {
    const [accessToken, accountId] = await Promise.all([
      this.getAccessToken(),
      this.getAccountId(),
    ]);

    logger.info({ projectId: options.projectId, accountId }, "Starting Instagram Reels upload");

    // Instagram requires a publicly accessible HTTPS URL — use a pre-signed S3 URL
    const videoUrl = await this.s3.getPresignedUrl(options.s3Key, PRESIGN_TTL_SECONDS);

    const caption = this.buildCaption(options.title, options.description, options.tags);

    // Step 1 — create media container
    const creationId = await this.createMediaContainer(
      accessToken,
      accountId,
      videoUrl,
      caption,
    );
    logger.info(
      { projectId: options.projectId, creationId },
      "Instagram media container created — waiting for processing",
    );

    // Step 2 — poll until Instagram has processed the video
    await this.pollUntilReady(accessToken, creationId);
    logger.info(
      { projectId: options.projectId, creationId },
      "Instagram video processing complete",
    );

    // Step 3 — publish
    const igMediaId = await this.publishMedia(accessToken, accountId, creationId);
    logger.info({ projectId: options.projectId, igMediaId }, "Instagram Reel published");

    return {
      platform: "instagram",
      platformVideoId: igMediaId,
      url: `https://www.instagram.com/reel/${igMediaId}/`,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async createMediaContainer(
    accessToken: string,
    accountId: string,
    videoUrl: string,
    caption: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: "true",
      access_token: accessToken,
    });

    const response = await fetch(`${GRAPH_BASE}/${accountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Instagram media container creation failed: HTTP ${response.status} — ${body}`,
      );
    }

    const data: any = await response.json();
    if (data.error) {
      throw new Error(
        `Instagram API error: ${data.error.message} (type=${data.error.type}, code=${data.error.code})`,
      );
    }

    return data.id as string;
  }

  private async pollUntilReady(accessToken: string, creationId: string): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const url =
        `${GRAPH_BASE}/${creationId}` +
        `?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;

      const response = await fetch(url);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Instagram status poll failed: HTTP ${response.status} — ${body}`);
      }

      const data: any = await response.json();
      if (data.error) {
        throw new Error(`Instagram poll error: ${data.error.message}`);
      }

      const statusCode = data.status_code as string | undefined;
      logger.debug({ creationId, statusCode }, "Instagram media status");

      if (statusCode === "FINISHED") return;

      if (statusCode === "ERROR") {
        throw new Error(
          `Instagram media processing failed (status: ${data.status ?? "ERROR"})`,
        );
      }
    }

    throw new Error(
      `Instagram media processing timeout after ${POLL_TIMEOUT_MS / 1000}s (creationId=${creationId})`,
    );
  }

  private async publishMedia(
    accessToken: string,
    accountId: string,
    creationId: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const response = await fetch(`${GRAPH_BASE}/${accountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Instagram media_publish failed: HTTP ${response.status} — ${body}`);
    }

    const data: any = await response.json();
    if (data.error) {
      throw new Error(`Instagram publish error: ${data.error.message}`);
    }

    return data.id as string;
  }

  private buildCaption(title: string, description: string, tags: string[]): string {
    const hashtags = tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
    return [title, description, hashtags]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2200); // Instagram caption max 2200 chars
  }

  private async getAccessToken(): Promise<string> {
    if (process.env.INSTAGRAM_ACCESS_TOKEN) return process.env.INSTAGRAM_ACCESS_TOKEN;
    const token = await this.settings.getPlaintext("integrations.instagramAccessToken");
    if (!token) {
      throw new Error(
        "Instagram access token not configured. Add integrations.instagramAccessToken in Settings.",
      );
    }
    return token;
  }

  private async getAccountId(): Promise<string> {
    if (process.env.INSTAGRAM_ACCOUNT_ID) return process.env.INSTAGRAM_ACCOUNT_ID;
    const id = await this.settings.getPlaintext("integrations.instagramAccountId");
    if (!id) {
      throw new Error(
        "Instagram account ID not configured. Add integrations.instagramAccountId in Settings.",
      );
    }
    return id;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
