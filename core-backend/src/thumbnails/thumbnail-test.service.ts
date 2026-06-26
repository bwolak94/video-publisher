import { Injectable, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { eq, and } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { thumbnailExperiments } from "../db/schema";
import { DallE3Service } from "../images/dalle3.service";
import { YouTubeAuthService } from "../youtube/youtube-auth.service";

const logger = pino({ level: "info" });

const THUMBNAIL_SIZE = "1792x1024"; // YouTube recommended 16:9

export interface ThumbnailVariant {
  index: number;
  s3Key: string;
  activeStart?: string;
  activeEnd?: string;
  impressions?: number;
  ctr?: number;
}

@Injectable()
export class ThumbnailTestService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly dalle3: DallE3Service,
    private readonly youtubeAuth: YouTubeAuthService
  ) {}

  /**
   * Generate 3 thumbnail variants with DALL-E 3 and upload each to S3.
   * Creates an experiment record and activates variant 0 immediately.
   */
  async startExperiment(
    projectId: string,
    youtubeVideoId: string,
    channelId: string,
    title: string,
    toneProfile: string
  ): Promise<schema.ThumbnailExperiment> {
    const basePrompt = `YouTube thumbnail for video titled "${title}". Style: ${toneProfile}. High contrast, bold typography, eye-catching composition, 16:9 aspect ratio.`;

    const variants: ThumbnailVariant[] = [];
    for (let i = 0; i < 3; i++) {
      const variantPrompt = `${basePrompt} Variant ${i + 1}: ${this.variantStyle(i)}`;
      const s3Key = `thumbnails/${projectId}/variant-${i}.png`;
      await this.dalle3.generateAndUpload(variantPrompt, THUMBNAIL_SIZE, s3Key);
      variants.push({ index: i, s3Key });
      logger.info({ projectId, variant: i, s3Key }, "Thumbnail variant generated");
    }

    const [experiment] = await this.db
      .insert(thumbnailExperiments)
      .values({
        projectId,
        youtubeVideoId,
        channelId,
        variants: variants as any,
        currentVariantIndex: "0",
        status: "running",
      } as any)
      .returning();

    // Activate variant 0
    await this.activateVariant(experiment, 0);
    variants[0].activeStart = new Date().toISOString();

    await this.db
      .update(thumbnailExperiments)
      .set({ variants: variants } as any)
      .where(eq(thumbnailExperiments.id, experiment.id));

    logger.info({ experimentId: experiment.id, projectId, youtubeVideoId }, "Thumbnail experiment started");
    return experiment;
  }

  /**
   * Scheduled every 48 hours: rotate to next variant, or pick winner if all rotated.
   */
  @Cron(CronExpression.EVERY_2_HOURS)
  async rotateThumbnails(): Promise<void> {
    const running = await this.db
      .select()
      .from(thumbnailExperiments)
      .where(eq(thumbnailExperiments.status, "running"));

    for (const experiment of running) {
      await this.rotateOrFinish(experiment).catch((err) =>
        logger.error({ experimentId: experiment.id, err }, "Thumbnail rotation failed")
      );
    }
  }

  private async rotateOrFinish(experiment: schema.ThumbnailExperiment): Promise<void> {
    const variants = experiment.variants as ThumbnailVariant[];
    const currentIdx = parseInt(experiment.currentVariantIndex ?? "0", 10);
    const nextIdx = currentIdx + 1;

    if (nextIdx >= variants.length) {
      // All variants shown — pick winner by highest CTR
      const winner = variants.reduce((best, v) => ((v.ctr ?? 0) > (best.ctr ?? 0) ? v : best), variants[0]);
      await this.activateVariant(experiment, winner.index);
      await this.db
        .update(thumbnailExperiments)
        .set({ status: "completed", winnerId: String(winner.index) } as any)
        .where(eq(thumbnailExperiments.id, experiment.id));
      logger.info({ experimentId: experiment.id, winnerIndex: winner.index }, "Thumbnail winner selected");
    } else {
      await this.activateVariant(experiment, nextIdx);
      await this.db
        .update(thumbnailExperiments)
        .set({ currentVariantIndex: String(nextIdx) } as any)
        .where(eq(thumbnailExperiments.id, experiment.id));
    }
  }

  protected async activateVariant(experiment: schema.ThumbnailExperiment, index: number): Promise<void> {
    const variants = experiment.variants as ThumbnailVariant[];
    const variant = variants[index];
    if (!variant) return;

    const accessToken = await this.youtubeAuth.getAccessToken(experiment.channelId);
    const thumbnailUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${variant.s3Key}`;

    // Fetch the image and upload to YouTube
    const imgRes = await fetch(thumbnailUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch thumbnail from S3: ${imgRes.status}`);
    const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${experiment.youtubeVideoId}&uploadType=media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "image/png",
          "Content-Length": String(imageBuffer.length),
        },
        body: imageBuffer,
      }
    );

    if (!uploadRes.ok) {
      throw new Error(`YouTube thumbnail upload failed: ${uploadRes.status}`);
    }

    logger.info(
      { experimentId: experiment.id, youtubeVideoId: experiment.youtubeVideoId, variantIndex: index },
      "Thumbnail variant activated on YouTube"
    );
  }

  private variantStyle(index: number): string {
    const styles = [
      "Clean, minimalist design with large bold text overlay",
      "Dramatic, high-contrast with face/reaction element and arrow",
      "Colorful gradient background with question hook text",
    ];
    return styles[index] ?? "Professional design";
  }
}
