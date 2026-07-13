import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import pino from "pino";
import { AudioCacheService } from "./audio-cache.service";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { splitAtSentenceBoundary } from "./text-splitter";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

export interface GenerateAudioParams {
  narrationText: string;
  voiceId: string;
  standardVoiceId: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

// Injected in tests to replace real fetch
export const ELEVENLABS_HTTP = Symbol("ELEVENLABS_HTTP");

@Injectable()
export class ElevenLabsService {
  private readonly breaker = new CircuitBreaker("elevenlabs", 5, 60_000);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor(
    private readonly cache: AudioCacheService,
    @Inject(ELEVENLABS_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService
  ) {
    this.baseUrl = process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io";
    this.bucket = process.env.S3_BUCKET ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  private async getApiKey(): Promise<string> {
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
    return (await this.settings.getPlaintext("integrations.elevenLabsKey")) ?? "";
  }

  /**
   * Generate audio for a scene narration.
   * Returns the S3 URL for the audio file.
   * Checks cache first; uploads to S3 before writing Redis (Rule #3).
   */
  async generateAudio(params: GenerateAudioParams): Promise<string> {
    const { narrationText, voiceId, standardVoiceId } = params;

    const cacheKey = this.cache.computeCacheKey(narrationText, voiceId);
    const cached = await this.cache.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    const chunks = splitAtSentenceBoundary(narrationText);

    let audioBuffer: Buffer;
    if (chunks.length === 1) {
      audioBuffer = await this.generateChunk(chunks[0], voiceId, standardVoiceId, params);
    } else {
      // Multiple chunks — generate each and concatenate via ffmpeg stub
      const buffers = await Promise.all(
        chunks.map((chunk) => this.generateChunk(chunk, voiceId, standardVoiceId, params))
      );
      audioBuffer = await this.concatenateAudio(buffers);
    }

    // I3: Normalize loudness to -16 LUFS (EBU R128 streaming target)
    audioBuffer = await this.normalizeAudio(audioBuffer).catch(() => audioBuffer);

    // S3 upload first (Rule #3: never write Redis before S3 succeeds)
    const s3Url = await this.uploadToS3(audioBuffer, cacheKey);

    // Write to Redis only after confirmed S3 upload
    await this.cache.setCached(cacheKey, s3Url);

    logger.info(
      {
        cacheKey,
        voiceId,
        durationEstimateMs: Math.round((narrationText.length / 150) * 1000),
        chunks: chunks.length,
      },
      "Audio generated and cached"
    );

    return s3Url;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async generateChunk(
    text: string,
    voiceId: string,
    standardVoiceId: string,
    params: GenerateAudioParams
  ): Promise<Buffer> {
    try {
      return await this.breaker.execute(() => this.callElevenLabs(text, voiceId, params));
    } catch (err: any) {
      if (err instanceof CircuitOpenError) throw err;

      // Rule #4: 4xx on cloned voice → retry with standard voice
      if (err?.status === 400 || err?.status === 404) {
        logger.warn(
          { voiceId, standardVoiceId, status: err.status },
          "Cloned voice not found, fell back to standard voice"
        );
        return this.breaker.execute(() =>
          this.callElevenLabs(text, standardVoiceId, params)
        );
      }

      throw err;
    }
  }

  protected async callElevenLabs(
    text: string,
    voiceId: string,
    params: Pick<GenerateAudioParams, "stability" | "similarityBoost" | "style">
  ): Promise<Buffer> {
    const url = `${this.baseUrl}/v1/text-to-speech/${voiceId}`;

    const response = await this.httpFetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": await this.getApiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: params.stability ?? 0.5,
          similarity_boost: params.similarityBoost ?? 0.75,
          style: params.style ?? 0.0,
        },
      }),
    });

    if (!response.ok) {
      const err: any = new Error(`ElevenLabs API error: ${response.status}`);
      err.status = response.status;
      throw err;
    }

    return Buffer.from(await response.arrayBuffer());
  }

  protected async uploadToS3(buffer: Buffer, cacheKey: string): Promise<string> {
    const key = `audio/${cacheKey}.mp3`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: "audio/mpeg",
      })
    );

    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  /**
   * I3: Normalize audio loudness to -16 LUFS using ffmpeg loudnorm filter.
   * Ensures consistent perceived volume across all generated narration clips.
   */
  protected async normalizeAudio(buffer: Buffer): Promise<Buffer> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elevenlabs-norm-"));
    const inputFile = path.join(tmpDir, "input.mp3");
    const outputFile = path.join(tmpDir, "normalized.mp3");

    try {
      fs.writeFileSync(inputFile, buffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputFile)
          .audioFilters("loudnorm=I=-16:TP=-1.5:LRA=11")
          .audioCodec("libmp3lame")
          .audioBitrate("128k")
          .output(outputFile)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      return fs.readFileSync(outputFile);
    } finally {
      for (const f of [inputFile, outputFile]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    }
  }

  /**
   * Concatenate audio buffers using ffmpeg (Rule #6 / UC-05).
   * Writes chunks to temp files, runs ffmpeg concat filter, returns merged buffer.
   */
  protected async concatenateAudio(buffers: Buffer[]): Promise<Buffer> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elevenlabs-"));
    const inputFiles: string[] = [];
    const outputFile = path.join(tmpDir, `out-${crypto.randomUUID()}.mp3`);

    try {
      // Write each buffer to a temp file
      for (let i = 0; i < buffers.length; i++) {
        const filePath = path.join(tmpDir, `chunk-${i}.mp3`);
        fs.writeFileSync(filePath, buffers[i]);
        inputFiles.push(filePath);
      }

      // Build ffmpeg concat list file
      const listFile = path.join(tmpDir, "concat.txt");
      const listContent = inputFiles.map((f) => `file '${f}'`).join("\n");
      fs.writeFileSync(listFile, listContent);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(listFile)
          .inputOptions(["-f concat", "-safe 0"])
          .audioCodec("libmp3lame")
          .audioBitrate("128k")
          .output(outputFile)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      return fs.readFileSync(outputFile);
    } finally {
      // Clean up temp files
      for (const f of [...inputFiles, outputFile, path.join(tmpDir, "concat.txt")]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    }
  }
}
