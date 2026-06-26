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
}
