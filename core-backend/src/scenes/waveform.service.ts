/**
 * I8: Audio waveform extraction service.
 *
 * Uses ffprobe to extract packet sizes from an audio file as a proxy for
 * amplitude, then downsamples to ~100 peaks suitable for frontend rendering.
 * Results are cached in Redis for 7 days (keyed by S3 URL).
 */
import { Injectable, Inject } from "@nestjs/common";
import { execFile } from "child_process";
import { promisify } from "util";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

const execFileAsync = promisify(execFile);
const logger = pino({ level: "info" });

const CACHE_TTL_S = 7 * 24 * 60 * 60; // 7 days
const TARGET_PEAKS = 100;

export interface WaveformData {
  peaks: number[];          // normalised 0.0–1.0, length ≤ TARGET_PEAKS
  durationSeconds: number;
}

@Injectable()
export class WaveformService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Extract waveform peaks from a publicly-accessible audio URL. */
  async extract(audioUrl: string): Promise<WaveformData> {
    const cacheKey = `waveform:${Buffer.from(audioUrl).toString("base64").slice(0, 64)}`;

    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      return JSON.parse(cached) as WaveformData;
    }

    const result = await this.runFfprobe(audioUrl);
    await this.redis.setex(cacheKey, CACHE_TTL_S, JSON.stringify(result)).catch(() => {});

    return result;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async runFfprobe(url: string): Promise<WaveformData> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "packet=pts_time,size",
        "-of", "json",
        url,
      ], { timeout: 30_000 }));
    } catch (err) {
      logger.warn({ err, url }, "I8: ffprobe waveform extraction failed — returning empty");
      return { peaks: [], durationSeconds: 0 };
    }

    let parsed: { packets?: Array<{ pts_time: string; size: string }> };
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return { peaks: [], durationSeconds: 0 };
    }

    const packets = parsed.packets ?? [];
    if (packets.length === 0) return { peaks: [], durationSeconds: 0 };

    const sizes = packets.map((p) => parseInt(p.size, 10));
    const durationSeconds = parseFloat(packets[packets.length - 1]?.pts_time ?? "0");

    // Downsample to TARGET_PEAKS using block averaging
    const blockSize = Math.max(1, Math.floor(sizes.length / TARGET_PEAKS));
    const peaks: number[] = [];
    for (let i = 0; i < sizes.length; i += blockSize) {
      const block = sizes.slice(i, i + blockSize);
      peaks.push(block.reduce((a, b) => a + b, 0) / block.length);
    }

    // Normalise to 0.0–1.0
    const maxPeak = Math.max(...peaks, 1);
    const normalised = peaks.map((p) => Math.round((p / maxPeak) * 1000) / 1000);

    logger.info({ url: url.slice(0, 60), peaks: normalised.length, durationSeconds }, "I8: Waveform extracted");
    return { peaks: normalised, durationSeconds };
  }
}
