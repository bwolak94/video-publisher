import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { appSettings } from "../db/schema";
import { TokenCryptoService } from "../youtube/token-crypto.service";

// Fields that are stored encrypted at rest and masked in GET responses
const SENSITIVE_KEYS = new Set([
  "integrations.elevenLabsKey",
  "integrations.openaiKey",
  "integrations.anthropicKey",
  "integrations.runwayKey",
  "integrations.pexelsKey",
  "integrations.awsAccessKey",
  "integrations.awsSecretKey",
  "alerts.slackWebhookUrl",
  "alerts.smtpPass",
]);

const MASK = "__STORED__";

export interface SettingsDto {
  integrations: {
    elevenLabsKey: string;
    openaiKey: string;
    anthropicKey: string;
    runwayKey: string;
    pexelsKey: string;
    awsAccessKey: string;
    awsSecretKey: string;
    awsRegion: string;
    s3Bucket: string;
  };
  worker: {
    enabled: boolean;
    cronSchedule: string;
    nicheProfileId: string;
    minViralityScore: number;
    dedupWindowHours: number;
    aiBackendUrl: string;
  };
  alerts: {
    slackWebhookUrl: string;
    dashboardUrl: string;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    alertEmailTo: string;
  };
  costRates: {
    elevenlabsPerChar: string;
    runwayPerScene: string;
    dalle3PerImage: string;
    lambdaPerMin: string;
  };
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly crypto: TokenCryptoService
  ) {}

  // ── Read ─────────────────────────────────────────────────────────────────────

  async getAll(): Promise<SettingsDto> {
    const rows: { key: string; value: string; isEncrypted: boolean | null }[] =
      await this.db.select().from(appSettings);

    const map = new Map(rows.map((r) => [r.key, r]));

    const get = (key: string, fallback: string): string => {
      const row = map.get(key);
      if (!row) return fallback;
      if (row.isEncrypted) return MASK; // never expose plaintext
      return row.value;
    };

    return {
      integrations: {
        elevenLabsKey: get("integrations.elevenLabsKey", ""),
        openaiKey: get("integrations.openaiKey", ""),
        anthropicKey: get("integrations.anthropicKey", ""),
        runwayKey: get("integrations.runwayKey", ""),
        pexelsKey: get("integrations.pexelsKey", ""),
        awsAccessKey: get("integrations.awsAccessKey", ""),
        awsSecretKey: get("integrations.awsSecretKey", ""),
        awsRegion: get("integrations.awsRegion", "eu-central-1"),
        s3Bucket: get("integrations.s3Bucket", ""),
      },
      worker: {
        enabled: get("worker.enabled", "false") === "true",
        cronSchedule: get("worker.cronSchedule", "0 * * * *"),
        nicheProfileId: get("worker.nicheProfileId", "tech"),
        minViralityScore: parseFloat(get("worker.minViralityScore", "0.65")),
        dedupWindowHours: parseInt(get("worker.dedupWindowHours", "48"), 10),
        aiBackendUrl: get("worker.aiBackendUrl", "http://localhost:8000"),
      },
      alerts: {
        slackWebhookUrl: get("alerts.slackWebhookUrl", ""),
        dashboardUrl: get("alerts.dashboardUrl", "http://localhost:3000/dashboard/dlq"),
        smtpHost: get("alerts.smtpHost", ""),
        smtpPort: get("alerts.smtpPort", "587"),
        smtpUser: get("alerts.smtpUser", ""),
        smtpPass: get("alerts.smtpPass", ""),
        smtpFrom: get("alerts.smtpFrom", "alerts@ai-video-factory.app"),
        alertEmailTo: get("alerts.alertEmailTo", ""),
      },
      costRates: {
        elevenlabsPerChar: get("costRates.elevenlabsPerChar", "0.0003"),
        runwayPerScene: get("costRates.runwayPerScene", "0.15"),
        dalle3PerImage: get("costRates.dalle3PerImage", "0.04"),
        lambdaPerMin: get("costRates.lambdaPerMin", "0.001"),
      },
    };
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  async upsertMany(entries: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      // Skip masked sentinel — user didn't change this field
      if (value === MASK) continue;
      // Skip empty values for sensitive keys (don't overwrite with blank)
      if (SENSITIVE_KEYS.has(key) && !value) continue;

      const isSensitive = SENSITIVE_KEYS.has(key);
      const stored = isSensitive ? this.crypto.encryptRefreshToken(value) : value;

      await this.db
        .insert(appSettings)
        .values({ key, value: stored, isEncrypted: isSensitive, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: stored, isEncrypted: isSensitive, updatedAt: new Date() },
        });
    }
  }

  // ── Read plaintext (internal use only — never returned to frontend) ──────────

  async getPlaintext(key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));

    const row = rows[0];
    if (!row) return null;
    if (row.isEncrypted) return this.crypto.decryptRefreshToken(row.value);
    return row.value;
  }
}
