import { Injectable } from "@nestjs/common";
import { google } from "googleapis";
import pino from "pino";
import { YouTubeAuthService } from "./youtube-auth.service";

const logger = pino({ level: "info" });

export type PrivacyStatus = "private" | "unlisted" | "public";

@Injectable()
export class YouTubeVisibilityService {
  constructor(private readonly auth: YouTubeAuthService) {}

  async promote(
    channelId: string,
    videoId: string,
    status: PrivacyStatus
  ): Promise<void> {
    const accessToken = await this.auth.getAccessToken(channelId);
    const youtube = this.buildYouTubeClient(accessToken);

    await youtube.videos.update({
      part: ["status"],
      requestBody: {
        id: videoId,
        status: { privacyStatus: status },
      },
    });

    logger.info({ channelId, videoId, status }, "YouTube video visibility updated");
  }

  async schedulePublish(
    channelId: string,
    videoId: string,
    publishAt: string
  ): Promise<void> {
    const accessToken = await this.auth.getAccessToken(channelId);
    const youtube = this.buildYouTubeClient(accessToken);

    await youtube.videos.update({
      part: ["status"],
      requestBody: {
        id: videoId,
        status: { privacyStatus: "private", publishAt },
      },
    });

    logger.info({ channelId, videoId, publishAt }, "YouTube video publish scheduled");
  }

  protected buildYouTubeClient(accessToken: string) {
    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    return google.youtube({ version: "v3", auth: authClient });
  }
}
