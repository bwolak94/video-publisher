import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";

const logger = pino({ level: "info" });

export const SD_HTTP = Symbol("SD_HTTP");

@Injectable()
export class StableDiffusionService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly sdApiUrl: string | undefined;

  constructor(@Inject(SD_HTTP) private readonly httpFetch: typeof fetch) {
    this.sdApiUrl = process.env.SD_API_URL;
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    });
  }

  isAvailable(): boolean {
    return !!this.sdApiUrl;
  }

  /**
   * Generate an image via Stable Diffusion (AUTOMATIC1111 REST API) and upload to S3.
   * SD returns base64-encoded PNG — decoded and uploaded directly.
   * Returns s3:// URL.
   */
  async generateAndUpload(
    prompt: string,
    width: number,
    height: number,
    s3Key: string
  ): Promise<string> {
    if (!this.sdApiUrl) {
      throw new Error("SD_API_URL not configured — Stable Diffusion fallback is disabled");
    }

    const base64Image = await this.generate(prompt, width, height);
    return this.uploadToS3(base64Image, s3Key);
  }

  protected async generate(prompt: string, width: number, height: number): Promise<string> {
    const response = await this.httpFetch(`${this.sdApiUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        steps: 20,
        width,
        height,
        cfg_scale: 7,
      }),
    });

    if (!response.ok) {
      const err: any = new Error(`Stable Diffusion API error: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();
    return data.images[0] as string; // base64 PNG
  }

  protected async uploadToS3(base64Image: string, s3Key: string): Promise<string> {
    const buffer = Buffer.from(base64Image, "base64");

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: "image/png",
      })
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    logger.info({ s3Key, bytes: buffer.length }, "Stable Diffusion image uploaded to S3");
    return s3Url;
  }
}
