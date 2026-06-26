import { Injectable, Inject } from "@nestjs/common";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { google } from "googleapis";
import { Readable } from "stream";
import pino from "pino";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { projects } from "../db/schema";
import { EventsGateway } from "../gateway/events.gateway";
import { YouTubeAuthService } from "./youtube-auth.service";

const logger = pino({ level: "info" });

export interface UploadOptions {
  projectId: string;
  channelId: string;
  s3Key: string;         // e.g. renders/{projectId}/final.mp4
  totalBytes: number;
  title: string;
  description: string;
  tags: string[];
  privacyStatus?: "private" | "unlisted" | "public";
  publishAt?: string;    // ISO 8601 UTC
}

@Injectable()
export class YouTubeUploadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly auth: YouTubeAuthService,
    private readonly gateway: EventsGateway
  ) {}

  async upload(options: UploadOptions): Promise<string> {
    const {
      projectId,
      channelId,
      s3Key,
      totalBytes,
      title,
      description,
      tags,
      privacyStatus = "private",
      publishAt,
    } = options;

    const accessToken = await this.auth.getAccessToken(channelId);

    const s3Stream = await this.openS3Stream(s3Key);

    const videoId = await this.runResumableUpload({
      accessToken,
      stream: s3Stream,
      totalBytes,
      title,
      description,
      tags,
      privacyStatus,
      publishAt,
      onProgress: (percent) => this.gateway.broadcastUploadProgress(projectId, percent),
    });

    await this.db
      .update(projects)
      .set({ youtubeVideoId: videoId, status: "published" } as any)
      .where(eq(projects.id, projectId));

    logger.info({ projectId, videoId, channelId }, "YouTube upload complete");
    return videoId;
  }

  // ── S3 streaming (injectable for tests) ────────────────────────────────────

  protected async openS3Stream(s3Key: string): Promise<Readable> {
    const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
      })
    );
    return res.Body as Readable;
  }

  // ── Resumable upload (injectable for tests) ─────────────────────────────────

  protected async runResumableUpload(params: {
    accessToken: string;
    stream: Readable;
    totalBytes: number;
    title: string;
    description: string;
    tags: string[];
    privacyStatus: string;
    publishAt?: string;
    onProgress: (percent: number) => void;
  }): Promise<string> {
    const { accessToken, stream, totalBytes, title, description, tags, privacyStatus, publishAt, onProgress } = params;

    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: "v3", auth: authClient });

    const status: Record<string, unknown> = { privacyStatus };
    if (publishAt) {
      status.publishAt = publishAt;
    }

    // Stream S3 body directly to googleapis — never buffer entire video in RAM
    let bytesUploaded = 0;

    const res = await youtube.videos.insert(
      {
        part: ["snippet", "status"],
        requestBody: {
          snippet: { title, description, tags },
          status,
        },
        media: {
          mimeType: "video/mp4",
          body: stream,
        },
      },
      {
        onUploadProgress: (evt: { bytesRead: number }) => {
          bytesUploaded = evt.bytesRead;
          const percent = Math.round((bytesUploaded / totalBytes) * 100);
          onProgress(Math.min(percent, 100));
        },
      }
    );

    const videoId = res.data.id;
    if (!videoId) {
      throw new Error("YouTube upload succeeded but returned no videoId");
    }
    return videoId;
  }
}
