import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import pino from "pino";
import { S3UploadError, S3PermissionError, ConfigurationError } from "./s3-errors";

const logger = pino({ level: "info" });
const EXPECTED_REGION = "eu-central-1";

type AssetType = "audio" | "video" | "image" | "render" | "chunk";

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const region = process.env.AWS_REGION;
    if (region && region !== EXPECTED_REGION) {
      throw new ConfigurationError(`AWS_REGION must be ${EXPECTED_REGION}, got ${region}`);
    }
    this.bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    this.client = new S3Client({
      region: region ?? EXPECTED_REGION,
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }

  buildPath(type: "audio", cacheKey: string): string;
  buildPath(type: "video", cacheKey: string): string;
  buildPath(type: "image", cacheKey: string): string;
  buildPath(type: "render", projectId: string): string;
  buildPath(type: "chunk", projectId: string, sceneId: string): string;
  buildPath(type: AssetType, ...parts: string[]): string {
    switch (type) {
      case "audio":
        return `audio/${parts[0]}.mp3`;
      case "video":
        return `video/${parts[0]}.mp4`;
      case "image":
        return `images/${parts[0]}.png`;
      case "render":
        return `renders/${parts[0]}/${Date.now()}.mp4`;
      case "chunk":
        return `chunks/${parts[0]}/${parts[1]}.mp4`;
    }
  }

  async uploadBuffer(path: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: path,
          Body: buffer,
          ContentType: contentType,
        })
      );
      logger.info({ path, bucket: this.bucket }, "Buffer uploaded to S3");
      return `s3://${this.bucket}/${path}`;
    } catch (err) {
      throw new S3UploadError(`Failed to upload buffer to ${path}`, err);
    }
  }

  async uploadStream(path: string, stream: Readable, contentType: string): Promise<string> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: path,
          Body: stream,
          ContentType: contentType,
        },
      });
      await upload.done();
      logger.info({ path, bucket: this.bucket }, "Stream uploaded to S3");
      return `s3://${this.bucket}/${path}`;
    } catch (err) {
      throw new S3UploadError(`Failed to upload stream to ${path}`, err);
    }
  }

  async getPresignedUrl(path: string, ttlSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: path });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
      return true;
    } catch (err: any) {
      const code = err?.name ?? err?.code ?? err?.$metadata?.httpStatusCode;
      if (code === "NotFound" || code === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      if (err?.$metadata?.httpStatusCode === 403) {
        throw new S3PermissionError(path);
      }
      throw err;
    }
  }

  /** Return the byte size of an S3 object via HeadObject. Throws if not found. */
  async getObjectSize(path: string): Promise<number> {
    const resp = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
    return resp.ContentLength ?? 0;
  }

  /**
   * Return the S3 key of the most recently uploaded render for a project.
   * Scans `renders/{projectId}/` and picks the object with the latest LastModified.
   * Returns null when no render exists yet.
   */
  async getLatestRenderKey(projectId: string): Promise<string | null> {
    const prefix = `renders/${projectId}/`;
    const resp = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );
    if (!resp.Contents || resp.Contents.length === 0) return null;
    const latest = resp.Contents.sort(
      (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
    )[0];
    return latest.Key ?? null;
  }
}
