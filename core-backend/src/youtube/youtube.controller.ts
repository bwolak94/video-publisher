import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Redirect,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { YouTubeAuthService } from "./youtube-auth.service";
import { YouTubeUploadService } from "./youtube-upload.service";
import { YouTubeVisibilityService, type PrivacyStatus } from "./youtube-visibility.service";

interface UploadBody {
  projectId: string;
  channelId: string;
  s3Key: string;
  totalBytes: number;
  title: string;
  description: string;
  tags: string[];
  privacyStatus?: PrivacyStatus;
  publishAt?: string;
}

interface VisibilityBody {
  channelId: string;
  videoId: string;
  status: PrivacyStatus;
  publishAt?: string;
}

@Controller("api/youtube")
export class YouTubeController {
  constructor(
    private readonly authService: YouTubeAuthService,
    private readonly uploadService: YouTubeUploadService,
    private readonly visibilityService: YouTubeVisibilityService
  ) {}

  /** Step 1: Redirect user to Google OAuth consent screen */
  @Get("connect")
  @Redirect()
  async connect(@Query("userId") userId: string) {
    const state = `${userId}:${randomBytes(8).toString("hex")}`;
    const url = await this.authService.getAuthUrl(state);
    return { url };
  }

  /** Step 2: Google redirects here after consent */
  @Get("callback")
  @Redirect()
  async callback(
    @Query("code") code: string,
    @Query("state") state: string
  ) {
    const userId = state.split(":")[0];
    await this.authService.handleCallback(userId, code, state);
    const dashboardUrl = process.env.FRONTEND_URL ?? "http://localhost:3000/dashboard";
    return { url: `${dashboardUrl}?youtube=connected` };
  }

  /** Trigger a video upload to YouTube */
  @Post("upload")
  @HttpCode(HttpStatus.ACCEPTED)
  async upload(@Body() body: UploadBody) {
    const videoId = await this.uploadService.upload(body);
    return { videoId };
  }

  /** Promote visibility or schedule publish */
  @Patch("visibility")
  async updateVisibility(@Body() body: VisibilityBody) {
    if (body.publishAt) {
      await this.visibilityService.schedulePublish(body.channelId, body.videoId, body.publishAt);
    } else {
      await this.visibilityService.promote(body.channelId, body.videoId, body.status);
    }
    return { ok: true };
  }
}
