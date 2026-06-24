import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";

const logger = pino({ level: "info" });

export const DALLE_HTTP = Symbol("DALLE_HTTP");
export const DALLE_MODEL = "dall-e-3";

@Injectable()
export class DallE3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(@Inject(DALLE_HTTP) private readonly httpFetch: typeof fetch) {
    this.apiKey = process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    });
  }

  /**
   * Generate an image via DALL-E 3 and upload to S3.
   * Returns s3:// URL. Never returns the temporary DALL-E delivery URL.
   */
  async generateAndUpload(prompt: string, size: string, s3Key: string): Promise<string> {
    const deliveryUrl = await this.generate(prompt, size);
    return this.downloadToS3(deliveryUrl, s3Key);
  }

  protected async generate(prompt: string, size: string): Promise<string> {
    const response = await this.httpFetch(`${this.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DALLE_MODEL,
        prompt,
        n: 1,
        size,
      }),
    });

    if (!response.ok) {
      const err: any = new Error(`DALL-E 3 API error: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();
    return data.data[0].url as string;
  }

  protected async downloadToS3(deliveryUrl: string, s3Key: string): Promise<string> {
    const response = await this.httpFetch(deliveryUrl);
    if (!response.ok) {
      throw new Error(`Failed to download DALL-E image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: "image/png",
      })
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    logger.info({ s3Key, bytes: buffer.length }, "DALL-E image uploaded to S3");
    return s3Url;
  }
}
