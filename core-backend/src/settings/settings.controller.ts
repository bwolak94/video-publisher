import { Controller, Get, Put, Body, Delete, Param, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { SettingsService } from "./settings.service";
import { DRIZZLE } from "../db/db.module";
import { youtubeChannels } from "../db/schema";

@Controller("api/settings")
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    @Inject(DRIZZLE) private readonly db: any
  ) {}

  // ── GET all settings (sensitive values masked) ────────────────────────────

  @Get()
  async getAll() {
    return this.settings.getAll();
  }

  // ── PUT /api/settings/integrations ────────────────────────────────────────

  @Put("integrations")
  async saveIntegrations(@Body() body: Record<string, string>) {
    const allowed = [
      "elevenLabsKey", "openaiKey", "anthropicKey",
      "runwayKey", "pexelsKey",
      "klingAccessKey", "klingSecretKey", "archivalEnabled",
      "awsAccessKey", "awsSecretKey", "awsRegion", "s3Bucket",
    ];
    const entries: Record<string, string> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) entries[`integrations.${k}`] = body[k];
    }
    await this.settings.upsertMany(entries);
    return { ok: true };
  }

  // ── PUT /api/settings/worker ──────────────────────────────────────────────

  @Put("worker")
  async saveWorker(@Body() body: Record<string, string | boolean | number>) {
    const allowed = [
      "enabled", "cronSchedule", "nicheProfileId",
      "minViralityScore", "dedupWindowHours", "aiBackendUrl",
    ];
    const entries: Record<string, string> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) entries[`worker.${k}`] = String(body[k]);
    }
    await this.settings.upsertMany(entries);
    return { ok: true };
  }

  // ── PUT /api/settings/alerts ──────────────────────────────────────────────

  @Put("alerts")
  async saveAlerts(@Body() body: Record<string, string>) {
    const allowed = [
      "slackWebhookUrl", "dashboardUrl",
      "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom", "alertEmailTo",
    ];
    const entries: Record<string, string> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) entries[`alerts.${k}`] = body[k];
    }
    await this.settings.upsertMany(entries);
    return { ok: true };
  }

  // ── PUT /api/settings/cost-rates ─────────────────────────────────────────

  @Put("cost-rates")
  async saveCostRates(@Body() body: Record<string, string>) {
    const allowed = ["elevenlabsPerChar", "runwayPerScene", "dalle3PerImage", "lambdaPerMin"];
    const entries: Record<string, string> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) entries[`costRates.${k}`] = body[k];
    }
    await this.settings.upsertMany(entries);
    return { ok: true };
  }

  // ── GET /api/settings/channels — list connected YouTube channels ──────────

  @Get("channels")
  async listChannels() {
    const rows = await this.db.select({
      id: youtubeChannels.id,
      channelId: youtubeChannels.channelId,
      channelName: youtubeChannels.channelName,
      monthlyBudgetUsd: youtubeChannels.monthlyBudgetUsd,
      currentMonthSpendUsd: youtubeChannels.currentMonthSpendUsd,
      createdAt: youtubeChannels.createdAt,
    }).from(youtubeChannels);
    return rows;
  }

  // ── PUT /api/settings/channels/:id/budget ────────────────────────────────

  @Put("channels/:id/budget")
  async updateChannelBudget(
    @Param("id") id: string,
    @Body() body: { monthlyBudgetUsd: string }
  ) {
    await this.db
      .update(youtubeChannels)
      .set({ monthlyBudgetUsd: body.monthlyBudgetUsd })
      .where(eq(youtubeChannels.id, id));
    return { ok: true };
  }

  // ── DELETE /api/settings/channels/:id — disconnect channel ───────────────

  @Delete("channels/:id")
  async disconnectChannel(@Param("id") id: string) {
    await this.db
      .delete(youtubeChannels)
      .where(eq(youtubeChannels.id, id));
    return { ok: true };
  }

  // ── POST /api/settings/rotate-key — I10: re-encrypt a stored API key ───────

  /**
   * I10: Re-encrypt a stored API key with a fresh AES-GCM nonce.
   * Validates the key is functional before persisting the new ciphertext.
   *
   * Body: { key: "elevenLabsKey" | "openaiKey" | ... }
   */
  @Put("rotate-key")
  async rotateKey(@Body() body: { key: string }) {
    const sensitiveKeys: Record<string, string> = {
      elevenLabsKey: "integrations.elevenLabsKey",
      openaiKey: "integrations.openaiKey",
      runwayKey: "integrations.runwayKey",
      pexelsKey: "integrations.pexelsKey",
    };

    const settingsKey = sensitiveKeys[body.key];
    if (!settingsKey) {
      return { ok: false, error: `Unknown key: ${body.key}` };
    }

    const plaintext = await this.settings.getPlaintext(settingsKey);
    if (!plaintext) {
      return { ok: false, error: "Key not stored — nothing to rotate" };
    }

    // Quick validation ping per provider
    const valid = await this.validateKey(body.key, plaintext);
    if (!valid) {
      return { ok: false, error: "Key validation failed — rotation aborted" };
    }

    // Re-encrypt with a fresh random IV (encryptRefreshToken always generates new IV)
    await this.settings.upsertMany({ [settingsKey]: plaintext });

    return { ok: true, rotated: body.key };
  }

  private async validateKey(keyName: string, value: string): Promise<boolean> {
    try {
      if (keyName === "openaiKey") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: AbortSignal.timeout(5_000),
        });
        return res.status !== 401;
      }
      if (keyName === "elevenLabsKey") {
        const res = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": value },
          signal: AbortSignal.timeout(5_000),
        });
        return res.status !== 401;
      }
      // For other keys, skip validation and allow rotation
      return true;
    } catch {
      return false;
    }
  }
}
