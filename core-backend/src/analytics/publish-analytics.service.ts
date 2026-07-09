/**
 * F05: Audience Analytics Feedback Loop.
 *
 * Runs a cron job every hour to capture periodic analytics snapshots at
 * 24h, 72h, and 7d post-publish for each project's published videos.
 *
 * The `getInsights()` method synthesizes these snapshots via GPT-4o
 * into "what worked" patterns surfaced in the Creator research flow.
 */

import { Injectable, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { eq, and, sql } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { publishAnalyticsSnapshots, videoAnalytics } from "../db/schema";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

const SNAPSHOT_AGES_HOURS: Record<string, number> = {
  "24h": 24,
  "72h": 72,
  "7d":  168,
};

export interface AnalyticsInsights {
  projectId: string;
  topPerformingFormats: string[];
  audienceRetentionTips: string[];
  contentAnglesWithHighCtr: string[];
  summary: string;
  basedOnSnapshots: number;
}

@Injectable()
export class PublishAnalyticsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Every hour: look for published videos that have reached 24h, 72h, or 7d since
   * their first analytics record, and capture a snapshot if one doesn't exist yet.
   */
  @Cron("0 * * * *")
  async captureScheduledSnapshots(): Promise<void> {
    try {
      const published = await this.db
        .select({
          projectId:       videoAnalytics.projectId,
          platform:        videoAnalytics.platform,
          platformVideoId: videoAnalytics.platformVideoId,
          firstFetchedAt:  sql<Date>`MIN(${videoAnalytics.fetchedAt})`,
        })
        .from(videoAnalytics)
        .groupBy(videoAnalytics.projectId, videoAnalytics.platform, videoAnalytics.platformVideoId);

      const now = Date.now();

      for (const row of published) {
        if (!row.projectId || !row.firstFetchedAt) continue;

        const ageHours = (now - new Date(row.firstFetchedAt).getTime()) / 3_600_000;

        for (const [snapshotType, thresholdHours] of Object.entries(SNAPSHOT_AGES_HOURS)) {
          if (ageHours < thresholdHours) continue;

          // Check if snapshot already captured
          const existing = await this.db
            .select({ id: publishAnalyticsSnapshots.id })
            .from(publishAnalyticsSnapshots)
            .where(
              and(
                eq(publishAnalyticsSnapshots.projectId, row.projectId as string),
                eq(publishAnalyticsSnapshots.platformVideoId, row.platformVideoId),
                eq(publishAnalyticsSnapshots.snapshotType, snapshotType),
              ),
            )
            .limit(1);

          if (existing.length > 0) continue;

          // Fetch latest analytics record to snapshot
          const latest = await this.db
            .select()
            .from(videoAnalytics)
            .where(
              and(
                eq(videoAnalytics.projectId, row.projectId as string),
                eq(videoAnalytics.platformVideoId, row.platformVideoId),
              ),
            )
            .orderBy(sql`${videoAnalytics.fetchedAt} DESC`)
            .limit(1);

          if (!latest[0]) continue;

          await this.db.insert(publishAnalyticsSnapshots).values({
            projectId:              row.projectId as string,
            platform:               row.platform,
            platformVideoId:        row.platformVideoId,
            snapshotType,
            views:                  latest[0].views,
            likes:                  latest[0].likes,
            comments:               latest[0].comments,
            impressionCtr:          latest[0].impressionCtr,
            avgViewDurationSeconds: latest[0].avgViewDurationSeconds,
          } as any);

          logger.info({ projectId: row.projectId, snapshotType, platform: row.platform }, "Analytics snapshot captured");
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to capture analytics snapshots");
    }
  }

  /**
   * F05: Synthesize "what worked" insights from all available snapshots for a project.
   * Returns actionable patterns the Creator can inject into future outlines.
   */
  async getInsights(projectId: string): Promise<AnalyticsInsights> {
    const snapshots = await this.db
      .select()
      .from(publishAnalyticsSnapshots)
      .where(eq(publishAnalyticsSnapshots.projectId, projectId))
      .orderBy(sql`${publishAnalyticsSnapshots.capturedAt} ASC`);

    if (snapshots.length === 0) {
      return {
        projectId,
        topPerformingFormats: [],
        audienceRetentionTips: [],
        contentAnglesWithHighCtr: [],
        summary: "No analytics snapshots available yet — publish a video and check back after 24h.",
        basedOnSnapshots: 0,
      };
    }

    const prompt = this.buildInsightsPrompt(projectId, snapshots);
    const raw = await this.callOpenAI(prompt);

    let parsed: Omit<AnalyticsInsights, "projectId" | "basedOnSnapshots">;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        topPerformingFormats: [],
        audienceRetentionTips: [],
        contentAnglesWithHighCtr: [],
        summary: raw.trim(),
      };
    }

    return { projectId, basedOnSnapshots: snapshots.length, ...parsed };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildInsightsPrompt(projectId: string, snapshots: schema.PublishAnalyticsSnapshot[]): string {
    const data = snapshots.map((s) => ({
      snapshotType: s.snapshotType,
      platform: s.platform,
      views: s.views,
      likes: s.likes,
      comments: s.comments,
      impressionCtr: s.impressionCtr,
      avgViewDurationSeconds: s.avgViewDurationSeconds,
    }));

    return `You are a YouTube growth expert analyzing video performance data.

Project ID: ${projectId}
Analytics snapshots (${snapshots.length} data points):
${JSON.stringify(data, null, 2)}

Based on this performance data, provide actionable insights for future content.

Respond with a JSON object:
{
  "topPerformingFormats": ["<format insight 1>", "<format insight 2>"],
  "audienceRetentionTips": ["<retention tip 1>", "<retention tip 2>"],
  "contentAnglesWithHighCtr": ["<high-CTR angle 1>", "<high-CTR angle 2>"],
  "summary": "<2-sentence overall takeaway>"
}`;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
      ?? (await this.settings.getPlaintext("integrations.openaiKey"))
      ?? "";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? "{}";
  }
}
