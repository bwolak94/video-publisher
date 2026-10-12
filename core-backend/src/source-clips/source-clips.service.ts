import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import type { SourceClip } from "../db/schema";

const logger = pino({ level: "info" });

const ALLOWED_MIMETYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

@Injectable()
export class SourceClipsService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {
    this.bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3Client = new S3Client({
      region: "us-east-1",
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }

  /**
   * Validates mimetype, uploads to S3, runs ffprobe for metadata, persists row.
   * Returns the inserted source_clips row.
   */
  async upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<SourceClip> {
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported MIME type: ${file.mimetype}. Allowed: video/mp4, video/quicktime, video/webm`,
      );
    }

    const id = crypto.randomUUID();
    const s3Key = `source-clips/${id}/original.mp4`;

    // Upload to S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    const s3Url = `s3://${this.bucket}/${s3Key}`;
    logger.info({ id, s3Key }, "SourceClipsService: uploaded to S3");

    // Write buffer to tmp file for ffprobe
    const tmpPath = path.join("/tmp", `${id}.mp4`);
    let durationS: string | null = null;
    let fps: string | null = null;
    let resolution: string | null = null;

    try {
      fs.writeFileSync(tmpPath, file.buffer);
      const ffprobeOutput = execSync(
        `ffprobe -v quiet -print_format json -show_streams "${tmpPath}"`,
        { encoding: "utf8" },
      );
      const probeData = JSON.parse(ffprobeOutput) as {
        streams: Array<{
          duration?: string;
          r_frame_rate?: string;
          width?: number;
          height?: number;
        }>;
      };
      const stream = probeData.streams?.[0];
      if (stream) {
        if (stream.duration) {
          durationS = parseFloat(stream.duration).toFixed(2);
        }
        if (stream.r_frame_rate) {
          const parts = stream.r_frame_rate.split("/");
          if (parts.length === 2) {
            const num = parseFloat(parts[0]);
            const den = parseFloat(parts[1]);
            if (den > 0) {
              fps = (num / den).toFixed(2);
            }
          }
        }
        if (stream.width && stream.height) {
          resolution = `${stream.width}x${stream.height}`;
        }
      }
    } catch (err) {
      logger.warn({ id, err }, "SourceClipsService: ffprobe failed, proceeding without metadata");
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    }

    const rows = await this.db.execute(sql`
      INSERT INTO source_clips (id, name, s3_url, duration_s, fps, resolution)
      VALUES (
        ${id},
        ${file.originalname},
        ${s3Url},
        ${durationS},
        ${fps},
        ${resolution}
      )
      RETURNING *
    `);

    logger.info({ id }, "SourceClipsService: row inserted");
    return rows[0] as unknown as SourceClip;
  }

  async findById(id: string): Promise<SourceClip | null> {
    const rows = (await this.db.execute(
      sql`SELECT * FROM source_clips WHERE id = ${id}`,
    )) as unknown as Record<string, unknown>[];
    return rows.length > 0 ? (rows[0] as unknown as SourceClip) : null;
  }

  /**
   * Returns a presigned S3 PUT URL so the browser can upload directly to S3.
   * TTL is 15 minutes (900 s).
   */
  async getUploadUrl(
    filename: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; clipId: string; s3Key: string }> {
    const id = crypto.randomUUID();
    const s3Key = `source-clips/${id}/${filename}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
    return { uploadUrl, clipId: id, s3Key };
  }

  /**
   * Called after the browser PUT to S3 succeeds.
   * Inserts the DB row without running ffprobe (metadata will be null until a
   * background job enriches it, or the user provides it).
   */
  async confirmUpload(
    clipId: string,
    filename: string,
    s3Key: string,
  ): Promise<{ id: string; name: string; s3Url: string }> {
    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.db.execute(sql`
      INSERT INTO source_clips (id, name, s3_url)
      VALUES (${clipId}, ${filename}, ${s3Url})
      ON CONFLICT (id) DO NOTHING
    `);
    logger.info({ clipId, s3Key }, "SourceClipsService: confirmUpload row inserted");
    return { id: clipId, name: filename, s3Url };
  }

  /** Returns all clips ordered newest-first. */
  async findAll(): Promise<SourceClip[]> {
    const rows = (await this.db.execute(
      sql`SELECT * FROM source_clips ORDER BY created_at DESC`,
    )) as unknown as SourceClip[];
    return rows;
  }

  /** Persists in/out trim points for a clip. */
  async updateTrimPoints(
    id: string,
    inPoint: number,
    outPoint: number,
  ): Promise<{ id: string; inPointS: number; outPointS: number }> {
    await this.db.execute(sql`
      UPDATE source_clips
         SET in_point_s  = ${inPoint},
             out_point_s = ${outPoint}
       WHERE id = ${id}
    `);
    logger.info({ id, inPoint, outPoint }, "SourceClipsService: trim points updated");
    return { id, inPointS: inPoint, outPointS: outPoint };
  }
}
