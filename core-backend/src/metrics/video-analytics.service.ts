import { Injectable, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { eq, desc } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { projects, videoAnalytics } from "../db/schema";

const logger = pino({ level: "info" });

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Fetches post-publish analytics from YouTube Data API v3 and stores them in DB.
 * Runs hourly. Requires YOUTUBE_API_KEY env var (read-only; no OAuth needed for public stats).
 *
 * GET /api/projects/:id/analytics   — served by ProjectsController, reads from this table.
 */
@Injectable()
export class VideoAnalyticsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  /** Fetch and store the latest YouTube stats for all published projects. */
  @Cron(CronExpression.EVERY_HOUR)
  async syncYouTubeAnalytics(): Promise<void> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return; // No API key configured — skip silently
    }

    const rows = await this.db
      .select({ id: projects.id, youtubeVideoId: projects.youtubeVideoId })
      .from(projects)
      .where(eq(projects.status, "published" as any));

    if (rows.length === 0) return;

    logger.info({ count: rows.length }, "Syncing YouTube analytics");

    for (const project of rows) {
      if (!project.youtubeVideoId) continue;
      try {
        await this.fetchAndStoreYouTubeStats(project.id!, project.youtubeVideoId, apiKey);
      } catch (err: any) {
        logger.warn({ projectId: project.id, err: err.message }, "YouTube analytics fetch failed (skipping)");
      }
    }
  }

  private async fetchAndStoreYouTubeStats(
    projectId: string,
    videoId: string,
    apiKey: string,
  ): Promise<void> {
    const url =
      `${YT_API_BASE}/videos` +
      `?id=${encodeURIComponent(videoId)}` +
      `&part=statistics` +
      `&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube Data API error: HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const stats = data.items?.[0]?.statistics;
    if (!stats) return; // Video not found or private

    await this.db.insert(videoAnalytics).values({
      projectId,
      platform: "youtube",
      platformVideoId: videoId,
      views: stats.viewCount ?? "0",
      likes: stats.likeCount ?? "0",
      comments: stats.commentCount ?? "0",
    } as any);

    logger.debug({ projectId, videoId, views: stats.viewCount }, "YouTube analytics stored");
  }

  /** Return the latest analytics snapshot for a project across all platforms. */
  async getLatest(projectId: string): Promise<schema.VideoAnalytics[]> {
    // Return the most recent row per platform
    return this.db
      .select()
      .from(videoAnalytics)
      .where(eq(videoAnalytics.projectId, projectId))
      .orderBy(desc(videoAnalytics.fetchedAt))
      .limit(10);
  }

  /** Record analytics for any platform (called after a successful publish). */
  async record(
    projectId: string,
    platform: string,
    platformVideoId: string,
  ): Promise<void> {
    await this.db.insert(videoAnalytics).values({
      projectId,
      platform,
      platformVideoId,
      views: "0",
      likes: "0",
      comments: "0",
    } as any);
  }
}
