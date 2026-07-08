import { Controller, Get, Query, Redirect } from "@nestjs/common";
import * as crypto from "crypto";
import { TikTokAuthService } from "./tiktok-auth.service";
import { InstagramAuthService } from "./instagram-auth.service";

/**
 * OAuth2 callback controllers for TikTok and Instagram.
 *
 * TikTok:
 *   GET /api/tiktok/connect   → redirect to TikTok consent page
 *   GET /api/tiktok/callback  → handle OAuth2 callback
 *   GET /api/tiktok/status    → connection status
 *
 * Instagram (via Meta Graph API):
 *   GET /api/instagram/connect   → redirect to Meta consent page
 *   GET /api/instagram/callback  → handle OAuth2 callback
 *   GET /api/instagram/status    → connection status
 */
@Controller()
export class SocialAuthController {
  constructor(
    private readonly tiktok: TikTokAuthService,
    private readonly instagram: InstagramAuthService,
  ) {}

  // ── TikTok ──────────────────────────────────────────────────────────────────

  @Get("api/tiktok/connect")
  @Redirect()
  async tikTokConnect() {
    const state = crypto.randomBytes(16).toString("hex");
    const url = await this.tiktok.getAuthUrl(state);
    return { url, statusCode: 302 };
  }

  @Get("api/tiktok/callback")
  async tikTokCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error?: string,
  ) {
    if (error) {
      return { ok: false, error };
    }
    const result = await this.tiktok.handleCallback(code, state);
    return { ok: true, ...result };
  }

  @Get("api/tiktok/status")
  async tikTokStatus() {
    return this.tiktok.getStatus();
  }

  // ── Instagram ────────────────────────────────────────────────────────────────

  @Get("api/instagram/connect")
  @Redirect()
  async instagramConnect() {
    const state = crypto.randomBytes(16).toString("hex");
    const url = await this.instagram.getAuthUrl(state);
    return { url, statusCode: 302 };
  }

  @Get("api/instagram/callback")
  async instagramCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error?: string,
  ) {
    if (error) {
      return { ok: false, error };
    }
    const result = await this.instagram.handleCallback(code, state);
    return { ok: true, ...result };
  }

  @Get("api/instagram/status")
  async instagramStatus() {
    return this.instagram.getStatus();
  }
}
