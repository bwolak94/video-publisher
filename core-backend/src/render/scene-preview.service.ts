/**
 * I2: Single-scene preview render.
 *
 * Renders just one scene (as a 1-item timeline) via Remotion Lambda.
 * Returns a presigned URL to the short MP4 clip.
 * Much faster than full project renders — ideal for visual iteration.
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import pino from "pino";
import { RenderService } from "./render.service";
import { ScenesService } from "../scenes/scenes.service";
import { S3Service } from "../storage/s3.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });
const PREVIEW_URL_TTL = 3600; // 1 hour

@Injectable()
export class ScenePreviewService {
  constructor(
    private readonly render: RenderService,
    private readonly scenes: ScenesService,
    private readonly s3: S3Service,
  ) {}

  async renderPreview(sceneId: string): Promise<{ url: string; expiresIn: number }> {
    const { project, scene } = await this.scenes.findScene(sceneId);
    const sourceStoryboard = project.storyboard as VideoStoryboard;

    if (!scene.videoUrl && !scene.audioUrl) {
      throw new NotFoundException(`Scene ${sceneId} has no generated assets to preview`);
    }

    // Build a single-scene storyboard slice
    const previewStoryboard: VideoStoryboard = {
      meta: {
        ...sourceStoryboard.meta,
        title: `Preview: scene ${scene.sequenceNumber}`,
        // Remove music for quick preview renders
        musicTrack: undefined,
      },
      timeline: [{ ...scene, sequenceNumber: 1 }],
    };

    logger.info({ sceneId, projectId: project.id }, "I2: Starting single-scene preview render");

    const s3Url = await this.render.render(previewStoryboard, `${project.id}-preview-${sceneId}`);

    // Convert s3:// to presigned URL
    const key = s3Url.startsWith("s3://")
      ? s3Url.slice("s3://".length).split("/").slice(1).join("/")
      : s3Url;
    const url = await this.s3.getPresignedUrl(key, PREVIEW_URL_TTL);

    logger.info({ sceneId, url: url.slice(0, 80) }, "I2: Scene preview render complete");
    return { url, expiresIn: PREVIEW_URL_TTL };
  }
}
