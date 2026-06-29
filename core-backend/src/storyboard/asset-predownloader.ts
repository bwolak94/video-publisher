import { Injectable, Inject } from "@nestjs/common";
import { Readable } from "stream";
import { createHash } from "crypto";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import { VideoStoryboard, StoryboardScene } from "./video-storyboard";
import { NonS3UrlError, PredownloadError } from "./predownload-errors";

const logger = pino({ level: "info" });

export const PREDOWNLOAD_HTTP = Symbol("PREDOWNLOAD_HTTP");

interface DownloadTask {
  sceneIndex: number;
  sceneId: string;
  field: "audioUrl" | "videoUrl";
  url: string;
}

interface DownloadResult {
  task: DownloadTask;
  s3Url?: string;
  error?: string;
}

@Injectable()
export class AssetPredownloader {
  constructor(
    private readonly s3: S3Service,
    @Inject(PREDOWNLOAD_HTTP) private readonly httpFetch: typeof fetch
  ) {}

  /**
   * Scan storyboard for external (non-s3://) URLs, download them to S3,
   * and return the storyboard with all URLs rewritten to s3:// format.
   * Throws PredownloadError if any download fails.
   * Throws NonS3UrlError if any URL remains non-s3:// after processing.
   */
  async normalizeStoryboard(storyboard: VideoStoryboard): Promise<VideoStoryboard> {
    const tasks = this.collectExternalUrls(storyboard);

    if (tasks.length === 0) {
      logger.info({ event: "predownload_noop", reason: "all_assets_already_on_s3" });
      return storyboard;
    }

    // Parallel downloads — collect all results before acting on failures
    const results = await Promise.allSettled(
      tasks.map((task) => this.downloadOne(task))
    );

    const downloadResults: DownloadResult[] = results.map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      return { task: tasks[i], error: String(result.reason) };
    });

    const failures = downloadResults.filter((r) => r.error !== undefined);
    if (failures.length > 0) {
      for (const f of failures) {
        logger.error({
          sceneId: f.task.sceneId,
          field: f.task.field,
          url: f.task.url.slice(0, 80),
          reason: f.error,
        }, "Asset pre-download failed");
      }
      throw new PredownloadError(
        failures.map((f) => ({
          sceneId: f.task.sceneId,
          field: f.task.field,
          url: f.task.url,
          reason: f.error!,
        }))
      );
    }

    // Rewrite storyboard with new S3 URLs
    const updated = this.rewriteStoryboard(storyboard, downloadResults);

    // Final guard: assert all URLs are s3://
    this.assertAllS3(updated);

    return updated;
  }

  /**
   * Convert a MinIO public URL back to s3:// format if it points to our own bucket.
   * e.g. http://localhost:9000/video-publisher-assets/video/abc.mp4 → s3://video-publisher-assets/video/abc.mp4
   */
  private toS3IfMinio(url: string): string | null {
    const minioPublic = process.env.MINIO_PUBLIC_URL;
    const bucket = process.env.S3_BUCKET ?? process.env.S3_BUCKET_NAME ?? "video-publisher-assets";
    if (!minioPublic) return null;
    const prefix = `${minioPublic}/${bucket}/`;
    if (url.startsWith(prefix)) {
      return `s3://${bucket}/${url.slice(prefix.length)}`;
    }
    return null;
  }

  private collectExternalUrls(storyboard: VideoStoryboard): DownloadTask[] {
    const tasks: DownloadTask[] = [];
    for (let i = 0; i < storyboard.timeline.length; i++) {
      const scene = storyboard.timeline[i];
      if (scene.audioUrl && !scene.audioUrl.startsWith("s3://")) {
        const s3 = this.toS3IfMinio(scene.audioUrl);
        if (s3) {
          // Rewrite in-place — no download needed
          storyboard.timeline[i] = { ...scene, audioUrl: s3 };
        } else {
          tasks.push({ sceneIndex: i, sceneId: scene.sceneId, field: "audioUrl", url: scene.audioUrl });
        }
      }
      if (scene.videoUrl && !scene.videoUrl.startsWith("s3://")) {
        const s3 = this.toS3IfMinio(scene.videoUrl);
        if (s3) {
          storyboard.timeline[i] = { ...storyboard.timeline[i], videoUrl: s3 };
        } else {
          tasks.push({ sceneIndex: i, sceneId: scene.sceneId, field: "videoUrl", url: scene.videoUrl });
        }
      }
    }
    return tasks;
  }

  private async downloadOne(task: DownloadTask): Promise<DownloadResult> {
    const s3Url = await this.downloadToS3(task.url, task.field);
    logger.info({
      event: "predownload_rewrite",
      sceneId: task.sceneId,
      field: task.field,
      original: task.url.slice(0, 80),
      s3Url,
    });
    return { task, s3Url };
  }

  protected async downloadToS3(externalUrl: string, field: "audioUrl" | "videoUrl"): Promise<string> {
    const response = await this.httpFetch(externalUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} downloading ${externalUrl.slice(0, 80)}`);
    }

    const contentType = response.headers.get("content-type") ?? (field === "audioUrl" ? "audio/mpeg" : "video/mp4");
    const hash = createHash("sha256").update(externalUrl).digest("hex").slice(0, 16);
    const path = field === "audioUrl"
      ? this.s3.buildPath("audio", hash)
      : this.s3.buildPath("video", hash);

    const nodeStream = Readable.from(response.body as any);
    return this.s3.uploadStream(path, nodeStream, contentType);
  }

  private rewriteStoryboard(storyboard: VideoStoryboard, results: DownloadResult[]): VideoStoryboard {
    // Deep-clone the timeline array
    const timeline: StoryboardScene[] = storyboard.timeline.map((scene) => ({ ...scene }));

    for (const r of results) {
      if (r.s3Url) {
        timeline[r.task.sceneIndex] = {
          ...timeline[r.task.sceneIndex],
          [r.task.field]: r.s3Url,
        };
      }
    }

    return { ...storyboard, timeline };
  }

  private assertAllS3(storyboard: VideoStoryboard): void {
    for (const scene of storyboard.timeline) {
      if (scene.audioUrl && !scene.audioUrl.startsWith("s3://")) {
        throw new NonS3UrlError(`audioUrl in scene ${scene.sceneId} is not an S3 URL: ${scene.audioUrl}`);
      }
      if (scene.videoUrl && !scene.videoUrl.startsWith("s3://")) {
        throw new NonS3UrlError(`videoUrl in scene ${scene.sceneId} is not an S3 URL: ${scene.videoUrl}`);
      }
    }
  }
}
