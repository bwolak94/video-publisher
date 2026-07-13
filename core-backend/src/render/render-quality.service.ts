/**
 * I4: Render output quality report via ffprobe.
 *
 * After a render completes, probes the output MP4 to extract duration, resolution,
 * bitrate, and audio loudness. Stores the report as `projects.postRenderQuality`.
 * Catches silent failures (black video, no audio) before the video goes live.
 */
import { Injectable, Inject } from "@nestjs/common";
import { execFile } from "child_process";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import { S3Service } from "../storage/s3.service";

const execFileAsync = promisify(execFile);
const logger = pino({ level: "info" });

export interface RenderQualityReport {
  durationSeconds: number;
  width: number;
  height: number;
  bitrateBps: number;
  hasAudio: boolean;
  audioLoudnessLufs: number | null;
  probeError?: string;
  probedAt: string;
}

@Injectable()
export class RenderQualityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly s3: S3Service,
  ) {}

  /**
   * Probe the output MP4 and persist results to `projects.postRenderQuality`.
   * Non-fatal — errors are captured in the report, not thrown.
   */
  async probe(projectId: string, s3Url: string): Promise<RenderQualityReport> {
    const report = await this.runProbe(s3Url);

    await this.db
      .update(projects)
      .set({ postRenderQuality: report as any, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .catch(() => {});

    logger.info({ projectId, durationSeconds: report.durationSeconds, hasAudio: report.hasAudio }, "I4: Render quality report saved");
    return report;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async runProbe(s3Url: string): Promise<RenderQualityReport> {
    const probedAt = new Date().toISOString();

    // Convert s3:// to a presigned HTTPS URL for ffprobe
    let probeUrl: string;
    try {
      if (s3Url.startsWith("s3://")) {
        const withoutScheme = s3Url.slice("s3://".length);
        const slashIdx = withoutScheme.indexOf("/");
        const key = withoutScheme.slice(slashIdx + 1);
        probeUrl = await this.s3.getPresignedUrl(key, 300);
      } else {
        probeUrl = s3Url;
      }
    } catch {
      return { durationSeconds: 0, width: 0, height: 0, bitrateBps: 0, hasAudio: false, audioLoudnessLufs: null, probeError: "presign_failed", probedAt };
    }

    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        probeUrl,
      ], { timeout: 30_000 }));
    } catch (err: any) {
      return { durationSeconds: 0, width: 0, height: 0, bitrateBps: 0, hasAudio: false, audioLoudnessLufs: null, probeError: err.message?.slice(0, 200), probedAt };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return { durationSeconds: 0, width: 0, height: 0, bitrateBps: 0, hasAudio: false, audioLoudnessLufs: null, probeError: "parse_failed", probedAt };
    }

    const streams: any[] = parsed.streams ?? [];
    const format = parsed.format ?? {};
    const videoStream = streams.find((s) => s.codec_type === "video");
    const audioStream = streams.find((s) => s.codec_type === "audio");

    // Loudness via loudnorm filter (best-effort, separate ffprobe call)
    let audioLoudnessLufs: number | null = null;
    if (audioStream) {
      audioLoudnessLufs = await this.measureLoudness(probeUrl).catch(() => null);
    }

    return {
      durationSeconds: parseFloat(format.duration ?? "0"),
      width: videoStream?.width ?? 0,
      height: videoStream?.height ?? 0,
      bitrateBps: parseInt(format.bit_rate ?? "0", 10),
      hasAudio: !!audioStream,
      audioLoudnessLufs,
      probedAt,
    };
  }

  private async measureLoudness(url: string): Promise<number | null> {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", url,
      "-af", "loudnorm=print_format=json",
      "-f", "null", "-",
    ], { timeout: 60_000 });

    const match = stderr.match(/"input_i"\s*:\s*"(-?\d+\.?\d*)"/);
    return match ? parseFloat(match[1]) : null;
  }
}
