import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { eq, desc } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import {
  competitorChannels,
  competitorVideos,
  competitorGapAnalyses,
  type CompetitorChannel,
  type CompetitorGapAnalysis,
} from "../db/schema";

const logger = pino({ level: "info" });

export interface GapInsights {
  untappedTopics: string[];
  weakAngles: string[];       // topics competitors did poorly on
  differentiationHooks: string[];
  summary: string;
}

@Injectable()
export class CompetitorAnalysisService {
  private readonly youtubeApiKey = process.env.YOUTUBE_DATA_API_KEY;
  private readonly openaiApiKey  = process.env.OPENAI_API_KEY;

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async addCompetitor(userId: string, channelId: string, channelName?: string): Promise<CompetitorChannel> {
    const [row] = await this.db
      .insert(competitorChannels)
      .values({ userId, channelId, channelName: channelName ?? channelId, platform: "youtube" } as any)
      .returning();
    return row;
  }

  async listCompetitors(userId: string): Promise<CompetitorChannel[]> {
    return this.db.select().from(competitorChannels).where(eq(competitorChannels.userId, userId));
  }

  async removeCompetitor(userId: string, id: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(competitorChannels)
      .where(eq(competitorChannels.id, id))
      .limit(1);
    if (!rows[0] || rows[0].userId !== userId) throw new NotFoundException(`Competitor ${id} not found`);
    await this.db.delete(competitorChannels).where(eq(competitorChannels.id, id));
  }

  // ── Weekly cron ────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_WEEK)
  async weeklyAnalysis(): Promise<void> {
    logger.info("F4: Starting weekly competitor gap analysis");

    // Group competitors by userId
    const allCompetitors = await this.db.select().from(competitorChannels);
    const byUser = new Map<string, CompetitorChannel[]>();
    for (const c of allCompetitors) {
      const arr = byUser.get(c.userId) ?? [];
      arr.push(c);
      byUser.set(c.userId, arr);
    }

    for (const [userId, competitors] of byUser) {
      await this.analyzeForUser(userId, competitors).catch((err) =>
        logger.error({ userId, err: err.message }, "F4: Weekly competitor analysis failed for user")
      );
    }
  }

  /** Run gap analysis on demand for a specific user. */
  async analyzeNow(userId: string): Promise<CompetitorGapAnalysis> {
    const competitors = await this.listCompetitors(userId);
    if (competitors.length === 0) {
      throw new Error("No competitor channels configured. Add at least one via POST /api/competitors.");
    }
    return this.analyzeForUser(userId, competitors);
  }

  async getLatestInsights(userId: string): Promise<CompetitorGapAnalysis | null> {
    const rows = await this.db
      .select()
      .from(competitorGapAnalyses)
      .where(eq(competitorGapAnalyses.userId, userId))
      .orderBy(desc(competitorGapAnalyses.analyzedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  // ── Core pipeline ──────────────────────────────────────────────────────────

  private async analyzeForUser(userId: string, competitors: CompetitorChannel[]): Promise<CompetitorGapAnalysis> {
    // 1. Fetch recent videos for every competitor channel
    const allTitles: { channelName: string; title: string; viewCount: string }[] = [];

    for (const comp of competitors) {
      const videos = await this.fetchRecentVideos(comp).catch((err) => {
        logger.warn({ channelId: comp.channelId, err: err.message }, "F4: Failed to fetch competitor videos");
        return [];
      });

      for (const v of videos) {
        allTitles.push({ channelName: comp.channelName ?? comp.channelId, title: v.title, viewCount: v.viewCount ?? "0" });
        // Upsert video record
        await this.db
          .insert(competitorVideos)
          .values({
            competitorChannelId: comp.id,
            platformVideoId: v.platformVideoId,
            title: v.title,
            viewCount: v.viewCount ?? "0",
            publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          } as any)
          .onConflictDoNothing();
      }

      await this.db
        .update(competitorChannels)
        .set({ lastAnalyzedAt: new Date() } as any)
        .where(eq(competitorChannels.id, comp.id));
    }

    // 2. GPT-4o gap synthesis
    const insights = await this.synthesizeGaps(allTitles);

    // 3. Persist
    const [row] = await this.db
      .insert(competitorGapAnalyses)
      .values({ userId, insights } as any)
      .returning();

    logger.info({ userId, competitorCount: competitors.length }, "F4: Gap analysis complete");
    return row;
  }

  private async fetchRecentVideos(
    comp: CompetitorChannel,
  ): Promise<{ platformVideoId: string; title: string; viewCount: string; publishedAt?: string }[]> {
    if (!this.youtubeApiKey) {
      logger.warn({ channelId: comp.channelId }, "F4: YOUTUBE_DATA_API_KEY not set — skipping fetch");
      return [];
    }

    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&channelId=${encodeURIComponent(comp.channelId)}` +
      `&maxResults=20&order=date&type=video` +
      `&key=${this.youtubeApiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API returned ${res.status} for channel ${comp.channelId}`);

    const data = await res.json() as any;
    const videoIds: string[] = (data.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    // Fetch view counts
    const statsUrl =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=statistics,snippet&id=${videoIds.join(",")}` +
      `&key=${this.youtubeApiKey}`;

    const statsRes = await fetch(statsUrl);
    if (!statsRes.ok) throw new Error(`YouTube stats API returned ${statsRes.status}`);
    const statsData = await statsRes.json() as any;

    return (statsData.items ?? []).map((item: any) => ({
      platformVideoId: item.id,
      title: item.snippet?.title ?? "",
      viewCount: item.statistics?.viewCount ?? "0",
      publishedAt: item.snippet?.publishedAt,
    }));
  }

  private async synthesizeGaps(
    videos: { channelName: string; title: string; viewCount: string }[],
  ): Promise<GapInsights> {
    if (!this.openaiApiKey || videos.length === 0) {
      return {
        untappedTopics: [],
        weakAngles: [],
        differentiationHooks: [],
        summary: "Insufficient data for gap analysis.",
      };
    }

    const videoList = videos
      .sort((a, b) => parseInt(b.viewCount) - parseInt(a.viewCount))
      .slice(0, 40) // top 40 by views
      .map((v) => `[${v.channelName}] "${v.title}" (${parseInt(v.viewCount).toLocaleString()} views)`)
      .join("\n");

    const systemPrompt =
      "You are a YouTube content strategy analyst. Given a list of competitor video titles and " +
      "their view counts, identify content gaps and differentiation opportunities. " +
      "Return ONLY valid JSON, no markdown, no explanation.";

    const userPrompt =
      `Competitor videos (sorted by views):\n${videoList}\n\n` +
      "Identify:\n" +
      "1. Topics they haven't covered or underserved\n" +
      "2. Angles that performed poorly (low views relative to channel average)\n" +
      "3. Differentiated hook styles not yet used\n\n" +
      'Return JSON: {"untappedTopics":["..."],"weakAngles":["..."],"differentiationHooks":["..."],"summary":"..."}';

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.openaiApiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 600,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API returned ${res.status}`);
    const data = await res.json() as any;
    const raw: string = data.choices?.[0]?.message?.content ?? "{}";

    try {
      return JSON.parse(raw.trim()) as GapInsights;
    } catch {
      return {
        untappedTopics: [],
        weakAngles: [],
        differentiationHooks: [],
        summary: raw.trim(),
      };
    }
  }
}
