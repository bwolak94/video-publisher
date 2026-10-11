import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fal } from "@fal-ai/client";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { SourceClipsService } from "../source-clips/source-clips.service";

const logger = pino({ level: "info" });

export interface GenerateV2VDto {
  sourceClipId: string;
  in: number;
  out: number;
  controls: string[];
  characterId: string | null;
}

@Injectable()
export class V2VService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly sourceClipsService: SourceClipsService,
  ) {
    this.bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3Client = new S3Client({
      region: "us-east-1",
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
    fal.config({ credentials: process.env.FAL_API_KEY ?? "" });
  }

  /**
   * Runs the V2V pipeline:
   *   1. Load source clip from DB
   *   2. Extract time fragment with ffmpeg (tmp files)
   *   3. Upload fragment to S3
   *   4. Generate presigned URL for the fragment (60s TTL)
   *   5. Call fal.ai wan/video-to-video
   *   6. Download result and upload to S3 under clips/{jobId}/{sceneId}/v2v.mp4
   */
  async generateV2V(
    jobId: string,
    sceneId: string,
    dto: GenerateV2VDto,
  ): Promise<{ clipS3Url: string; status: string }> {
    // 1. Get source clip
    const clip = await this.sourceClipsService.findById(dto.sourceClipId);
    if (!clip) {
      throw new NotFoundException(`Source clip ${dto.sourceClipId} not found`);
    }

    // 2. Extract the s3 key from the s3Url (format: s3://bucket/key)
    // findById returns a raw SQL row so the column name is snake_case
    const clipRow = clip as unknown as Record<string, string>;
    const rawS3Url = clipRow["s3Url"] ?? clipRow["s3_url"] ?? "";
    const s3Key = rawS3Url.replace(`s3://${this.bucket}/`, "");

    // Download source clip from S3 to tmp
    const srcTmpPath = path.join("/tmp", `src-${dto.sourceClipId}.mp4`);
    const fragTmpPath = path.join("/tmp", `frag-${jobId}-${sceneId}.mp4`);

    await this.downloadS3ToFile(s3Key, srcTmpPath);

    // 3. Extract fragment with ffmpeg
    try {
      execSync(
        `ffmpeg -y -i "${srcTmpPath}" -ss ${dto.in} -to ${dto.out} -c copy "${fragTmpPath}"`,
        { stdio: "pipe" },
      );
    } finally {
      try { fs.unlinkSync(srcTmpPath); } catch { /* ignore */ }
    }

    // Upload fragment to S3
    const fragKey = `source-clips/${dto.sourceClipId}/fragment-${dto.in}-${dto.out}.mp4`;
    const fragBuffer = fs.readFileSync(fragTmpPath);
    try { fs.unlinkSync(fragTmpPath); } catch { /* ignore */ }

    await this.uploadBuffer(fragKey, fragBuffer, "video/mp4");

    // 4. Generate presigned URL for fragment (60s TTL)
    const presignedUrl = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({ Bucket: this.bucket, Key: fragKey }),
      { expiresIn: 60 },
    );

    // 5. Call fal.ai wan/video-to-video
    logger.info({ jobId, sceneId, sourceClipId: dto.sourceClipId }, "V2VService: calling fal.ai");
    const falResult = await fal.subscribe("fal-ai/wan/video-to-video", {
      input: {
        video_url: presignedUrl,
        prompt: `scene video generation, controls: ${dto.controls.join(", ")}`,
        num_frames: Math.round((dto.out - dto.in) * 24),
        guidance_scale: 7.5,
      },
    });

    const resultVideoUrl: string | undefined = (falResult?.data as any)?.video?.url;
    if (!resultVideoUrl) {
      throw new Error("fal.ai did not return a video URL");
    }

    // 6. Download result and upload to S3
    const resultResp = await fetch(resultVideoUrl);
    if (!resultResp.ok) {
      throw new Error(`Failed to download fal.ai result: HTTP ${resultResp.status}`);
    }
    const resultBuffer = Buffer.from(await resultResp.arrayBuffer());

    const outputKey = `clips/${jobId}/${sceneId}/v2v.mp4`;
    await this.uploadBuffer(outputKey, resultBuffer, "video/mp4");

    const clipS3Url = `s3://${this.bucket}/${outputKey}`;
    logger.info({ jobId, sceneId, clipS3Url }, "V2VService: V2V clip saved");

    return { clipS3Url, status: "queued" };
  }

  protected async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  private async downloadS3ToFile(key: string, destPath: string): Promise<void> {
    const resp = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    fs.writeFileSync(destPath, Buffer.concat(chunks));
  }
}
