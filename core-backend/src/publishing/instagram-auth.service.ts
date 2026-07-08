import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

const FB_DIALOG_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const FB_TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const STATE_TTL_SECONDS = 300;
const STATE_KEY_PREFIX = "instagram:state:";

// Scopes needed for Instagram Reels publishing via Meta Graph API
const INSTAGRAM_SCOPE =
  "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement";

/**
 * Instagram OAuth2 (via Meta Graph API) authentication service.
 *
 * Required env vars:
 *   INSTAGRAM_APP_ID      — Facebook App ID (from Meta Developer Portal)
 *   INSTAGRAM_APP_SECRET  — Facebook App Secret
 *   INSTAGRAM_REDIRECT_URI
 *
 * Flow:
 *   1. Redirect user → Meta OAuth consent (scopes: instagram_content_publish)
 *   2. Exchange code → short-lived Facebook User Access Token
 *   3. Exchange → long-lived token (60-day TTL)
 *   4. GET /me/accounts → find the Facebook Page
 *   5. GET /{page-id}?fields=instagram_business_account → get IG Account ID
 *   6. Store long-lived token + IG account ID in Settings
 *
 * Tokens stored in appSettings:
 *   instagram.accessToken   (plaintext, long-lived 60-day)
 *   instagram.accountId     (Instagram Business Account numeric ID)
 *   instagram.username      (for display)
 *   instagram.tokenExpiresAt
 */
@Injectable()
export class InstagramAuthService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: SettingsService,
  ) {}

  async getAuthUrl(state: string): Promise<string> {
    await this.redis.set(`${STATE_KEY_PREFIX}${state}`, "1", "EX", STATE_TTL_SECONDS);

    const appId = this.requireEnv("INSTAGRAM_APP_ID");
    const redirectUri = this.redirectUri();

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: INSTAGRAM_SCOPE,
      response_type: "code",
      state,
    });

    return `${FB_DIALOG_URL}?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ accountId: string; username: string }> {
    const valid = await this.redis.get(`${STATE_KEY_PREFIX}${state}`);
    if (!valid) throw new Error("Instagram OAuth state expired — restart the connection flow");
    await this.redis.del(`${STATE_KEY_PREFIX}${state}`);

    const appId = this.requireEnv("INSTAGRAM_APP_ID");
    const appSecret = this.requireEnv("INSTAGRAM_APP_SECRET");
    const redirectUri = this.redirectUri();

    // Step 1 — exchange code for short-lived user access token
    const shortToken = await this.exchangeCode(appId, appSecret, redirectUri, code);

    // Step 2 — exchange for 60-day long-lived token
    const { accessToken, expiresInSeconds } = await this.exchangeLongLived(appId, appSecret, shortToken);

    // Step 3 — get Instagram Business Account ID via /me/accounts
    const { accountId, username } = await this.resolveInstagramAccount(accessToken);

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    await this.settings.set("instagram.accessToken", accessToken, false);
    await this.settings.set("instagram.accountId", accountId, false);
    await this.settings.set("instagram.username", username, false);
    await this.settings.set("instagram.tokenExpiresAt", expiresAt, false);

    logger.info({ accountId, username }, "Instagram account connected");
    return { accountId, username };
  }

  async getAccessToken(): Promise<string> {
    const token = await this.settings.getPlaintext("instagram.accessToken");
    if (!token) throw new Error("Instagram not connected — call GET /api/instagram/connect first");

    const expiresAt = await this.settings.getPlaintext("instagram.tokenExpiresAt");
    if (expiresAt) {
      const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 86400);
      if (daysLeft < 5) {
        logger.warn({ daysLeft }, "Instagram long-lived token expiring soon — user must re-connect");
      }
    }

    return token;
  }

  async getStatus(): Promise<{ connected: boolean; username?: string; expiresAt?: string }> {
    const username = await this.settings.getPlaintext("instagram.username");
    const expiresAt = await this.settings.getPlaintext("instagram.tokenExpiresAt");
    return {
      connected: !!username,
      username: username ?? undefined,
      expiresAt: expiresAt ?? undefined,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async exchangeCode(
    appId: string,
    appSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(`${FB_TOKEN_URL}?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Facebook token exchange failed: HTTP ${response.status} — ${text}`);
    }

    const data: any = await response.json();
    if (data.error) throw new Error(`Facebook OAuth error: ${data.error.message}`);
    return data.access_token as string;
  }

  private async exchangeLongLived(
    appId: string,
    appSecret: string,
    shortToken: string,
  ): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    });

    const response = await fetch(`${FB_TOKEN_URL}?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Facebook long-lived token exchange failed: HTTP ${response.status} — ${text}`);
    }

    const data: any = await response.json();
    if (data.error) throw new Error(`Facebook long-lived token error: ${data.error.message}`);
    return {
      accessToken: data.access_token as string,
      expiresInSeconds: Number(data.expires_in ?? 5184000), // default 60 days
    };
  }

  private async resolveInstagramAccount(
    accessToken: string,
  ): Promise<{ accountId: string; username: string }> {
    // Get pages the user manages
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
    );

    if (!pagesRes.ok) {
      const text = await pagesRes.text().catch(() => "");
      throw new Error(`Failed to fetch Facebook pages: HTTP ${pagesRes.status} — ${text}`);
    }

    const pagesData: any = await pagesRes.json();
    if (pagesData.error) throw new Error(`Pages error: ${pagesData.error.message}`);

    const page = (pagesData.data as any[])?.find((p) => p.instagram_business_account?.id);
    if (!page) {
      throw new Error(
        "No Instagram Business Account found. Ensure your Facebook Page is linked to an Instagram Business/Creator account.",
      );
    }

    const accountId = page.instagram_business_account.id as string;

    // Get Instagram username
    const igRes = await fetch(
      `${GRAPH_BASE}/${accountId}?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
    );
    const igData: any = await igRes.json();

    return { accountId, username: (igData.username as string) ?? accountId };
  }

  private redirectUri(): string {
    return (
      process.env.INSTAGRAM_REDIRECT_URI ?? "http://localhost:3002/api/instagram/callback"
    );
  }

  private requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`${name} env var is not set`);
    return v;
  }
}
