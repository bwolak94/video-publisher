import { Injectable, Inject } from "@nestjs/common";
import { google } from "googleapis";
import pino from "pino";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { REDIS_CLIENT } from "../redis/redis.module";
import { youtubeChannels } from "../db/schema";
import { TokenCryptoService } from "./token-crypto.service";

const logger = pino({ level: "info" });

const PKCE_TTL_SECONDS = 300; // 5 minutes
const PKCE_KEY_PREFIX = "pkce:verifier:";

export interface ConnectedChannel {
  channelId: string;
  channelName: string;
}

@Injectable()
export class YouTubeAuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly crypto: TokenCryptoService
  ) {}

  /** Returns the Google OAuth2 consent URL with PKCE. */
  async getAuthUrl(state: string): Promise<string> {
    const verifier = this.crypto.generateCodeVerifier();
    const challenge = this.crypto.generateCodeChallenge(verifier);

    await this.redis.set(
      `${PKCE_KEY_PREFIX}${state}`,
      verifier,
      "EX",
      PKCE_TTL_SECONDS
    );

    const client = this.buildOAuth2Client();
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"],
      state,
      code_challenge: challenge,
      code_challenge_method: "S256" as any,
    });
  }

  /**
   * Exchanges the authorization code for tokens and stores the encrypted
   * refresh token in the DB.
   */
  async handleCallback(
    userId: string,
    code: string,
    state: string
  ): Promise<ConnectedChannel> {
    const verifier = await this.redis.get(`${PKCE_KEY_PREFIX}${state}`);
    if (!verifier) {
      throw new Error("PKCE verifier expired or not found — restart OAuth flow");
    }
    await this.redis.del(`${PKCE_KEY_PREFIX}${state}`);

    const client = this.buildOAuth2Client();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });

    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token — ensure prompt=consent");
    }

    const encryptedRefreshToken = this.crypto.encryptRefreshToken(tokens.refresh_token);

    // Fetch the connected channel name
    client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: client });
    const channelRes = await youtube.channels.list({ part: ["snippet"], mine: true });
    const channel = channelRes.data.items?.[0];
    const channelId = channel?.id ?? "unknown";
    const channelName = channel?.snippet?.title ?? "Unknown Channel";

    // Upsert channel record
    const existing = await this.db
      .select()
      .from(youtubeChannels)
      .where(eq(youtubeChannels.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(youtubeChannels)
        .set({ refreshTokenEncrypted: encryptedRefreshToken, channelName })
        .where(eq(youtubeChannels.userId, userId));
    } else {
      await this.db.insert(youtubeChannels).values({
        userId,
        channelId,
        channelName,
        refreshTokenEncrypted: encryptedRefreshToken,
      });
    }

    logger.info({ userId, channelId }, "YouTube channel connected");
    return { channelId, channelName };
  }

  /**
   * Retrieves a valid access token for the given channel.
   * Rotates the refresh token on every call (per Rule #3).
   */
  async getAccessToken(channelId: string): Promise<string> {
    const rows = await this.db
      .select()
      .from(youtubeChannels)
      .where(eq(youtubeChannels.channelId, channelId))
      .limit(1);

    if (rows.length === 0) {
      throw new Error(`No YouTube channel found: ${channelId}`);
    }

    const row = rows[0];
    const refreshToken = this.crypto.decryptRefreshToken(row.refreshTokenEncrypted);

    const client = this.buildOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });

    let newCredentials: any;
    try {
      const { credentials } = await client.refreshAccessToken();
      newCredentials = credentials;
    } catch (err: any) {
      if (err?.message?.includes("invalid_grant")) {
        await this.handleInvalidGrant(channelId);
      }
      throw err;
    }

    // Rotate refresh token if Google issued a new one
    if (newCredentials.refresh_token && newCredentials.refresh_token !== refreshToken) {
      const newEncrypted = this.crypto.encryptRefreshToken(newCredentials.refresh_token);
      try {
        await this.db
          .update(youtubeChannels)
          .set({ refreshTokenEncrypted: newEncrypted })
          .where(eq(youtubeChannels.channelId, channelId));
      } catch (dbErr) {
        logger.error(
          { channelId, level: "CRITICAL" },
          "Failed to persist rotated refresh token — user may need to re-authenticate"
        );
      }
    }

    return newCredentials.access_token!;
  }

  private async handleInvalidGrant(channelId: string): Promise<void> {
    logger.warn({ channelId }, "YouTube refresh token invalid_grant — clearing from DB");

    await this.db
      .update(youtubeChannels)
      .set({ refreshTokenEncrypted: null })
      .where(eq(youtubeChannels.channelId, channelId));

    const webhookUrl = process.env.WORKER_NOTIFICATION_WEBHOOK;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "youtube_auth_expired",
          channelId,
          message: "YouTube connection expired. Please reconnect.",
        }),
      }).catch((err) =>
        logger.error({ err }, "Failed to send invalid_grant notification")
      );
    }
  }

  protected buildOAuth2Client(): any {
    return new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI ?? "http://localhost:3002/api/youtube/callback"
    );
  }
}
