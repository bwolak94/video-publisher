import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";
import { SettingsService } from "../settings/settings.service";
import { TokenCryptoService } from "../youtube/token-crypto.service";

const logger = pino({ level: "info" });

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const STATE_TTL_SECONDS = 300;
const STATE_KEY_PREFIX = "tiktok:state:";
const TIKTOK_SCOPE = "user.info.basic,video.publish,video.upload";

/**
 * TikTok OAuth 2.0 authentication service.
 *
 * Required env vars:
 *   TIKTOK_CLIENT_KEY     — from TikTok Developer Portal → App → App Key
 *   TIKTOK_CLIENT_SECRET  — App Secret
 *   TIKTOK_REDIRECT_URI   — must match Developer Portal redirect URI list
 *
 * Tokens stored in appSettings:
 *   tiktok.accessToken      (plaintext  — refreshed before expiry)
 *   tiktok.refreshToken     (encrypted  — 365-day lifetime)
 *   tiktok.openId           (TikTok user identifier)
 *   tiktok.tokenExpiresAt   (ISO timestamp)
 */
@Injectable()
export class TikTokAuthService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: SettingsService,
    private readonly crypto: TokenCryptoService,
  ) {}

  /** Returns the TikTok OAuth2 consent URL. */
  async getAuthUrl(state: string): Promise<string> {
    await this.redis.set(`${STATE_KEY_PREFIX}${state}`, "1", "EX", STATE_TTL_SECONDS);

    const clientKey = this.requireEnv("TIKTOK_CLIENT_KEY");
    const redirectUri = process.env.TIKTOK_REDIRECT_URI ?? "http://localhost:3002/api/tiktok/callback";

    const params = new URLSearchParams({
      client_key: clientKey,
      scope: TIKTOK_SCOPE,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });

    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  /** Exchanges the authorization code for tokens and persists them in Settings. */
  async handleCallback(code: string, state: string): Promise<{ openId: string }> {
    const valid = await this.redis.get(`${STATE_KEY_PREFIX}${state}`);
    if (!valid) throw new Error("TikTok OAuth state expired or invalid — restart the connection flow");
    await this.redis.del(`${STATE_KEY_PREFIX}${state}`);

    const clientKey = this.requireEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = this.requireEnv("TIKTOK_CLIENT_SECRET");
    const redirectUri = process.env.TIKTOK_REDIRECT_URI ?? "http://localhost:3002/api/tiktok/callback";

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`TikTok token exchange failed: HTTP ${response.status} — ${text}`);
    }

    const data: any = await response.json();
    if (data.error) {
      throw new Error(`TikTok token error: ${data.error_description ?? data.error}`);
    }

    const { access_token, refresh_token, expires_in, open_id } = data.data ?? data;

    await this.settings.set("tiktok.accessToken", access_token, false);
    await this.settings.set("tiktok.refreshToken", this.crypto.encryptRefreshToken(refresh_token), true);
    await this.settings.set("tiktok.openId", open_id, false);
    await this.settings.set(
      "tiktok.tokenExpiresAt",
      new Date(Date.now() + Number(expires_in) * 1000).toISOString(),
      false,
    );

    logger.info({ openId: open_id }, "TikTok account connected");
    return { openId: open_id };
  }

  /** Returns a valid TikTok access token, refreshing if near expiry. */
  async getAccessToken(): Promise<string> {
    const expiresAt = await this.settings.getPlaintext("tiktok.tokenExpiresAt");
    const isExpiring = !expiresAt || Date.now() > new Date(expiresAt).getTime() - 60_000;

    if (!isExpiring) {
      const token = await this.settings.getPlaintext("tiktok.accessToken");
      if (token) return token;
    }

    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    const encryptedRefresh = await this.settings.getPlaintext("tiktok.refreshToken");
    if (!encryptedRefresh) throw new Error("TikTok not connected — call GET /api/tiktok/connect first");

    const refreshToken = this.crypto.decryptRefreshToken(encryptedRefresh);
    const clientKey = this.requireEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = this.requireEnv("TIKTOK_CLIENT_SECRET");

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`TikTok token refresh failed: HTTP ${response.status} — ${text}`);
    }

    const data: any = await response.json();
    const { access_token, expires_in, refresh_token: newRefresh } = data.data ?? data;

    await this.settings.set("tiktok.accessToken", access_token, false);
    await this.settings.set(
      "tiktok.tokenExpiresAt",
      new Date(Date.now() + Number(expires_in) * 1000).toISOString(),
      false,
    );
    if (newRefresh) {
      await this.settings.set("tiktok.refreshToken", this.crypto.encryptRefreshToken(newRefresh), true);
    }

    logger.info("TikTok access token refreshed");
    return access_token as string;
  }

  async getStatus(): Promise<{ connected: boolean; openId?: string; expiresAt?: string }> {
    const openId = await this.settings.getPlaintext("tiktok.openId");
    const expiresAt = await this.settings.getPlaintext("tiktok.tokenExpiresAt");
    return { connected: !!openId, openId: openId ?? undefined, expiresAt: expiresAt ?? undefined };
  }

  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} env var is not set`);
    return value;
  }
}
