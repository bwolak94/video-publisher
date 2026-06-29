import { Controller, Post, Param, HttpCode, HttpStatus } from "@nestjs/common";
import pino from "pino";
import { ScenesService } from "./scenes.service";
import { VideoAssetService } from "../media/video-asset.service";
import { ElevenLabsService } from "../elevenlabs/elevenlabs.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — ElevenLabs default

/**
 * Convert an internal S3/MinIO URL to a browser-accessible public URL.
 * - s3://bucket/key           → {MINIO_PUBLIC_URL}/bucket/key
 * - https://bucket.s3.*.com/key → {MINIO_PUBLIC_URL}/bucket/key
 * Falls back to the original URL when no MinIO endpoint is configured.
 */
function toPublicUrl(url: string): string {
  const publicBase = process.env.MINIO_PUBLIC_URL;
  if (!publicBase) return url;

  const bucket = process.env.S3_BUCKET ?? process.env.S3_BUCKET_NAME ?? "video-publisher-assets";

  if (url.startsWith("s3://")) {
    // s3://bucket/key → publicBase/bucket/key
    return `${publicBase}/${url.slice("s3://".length)}`;
  }

  // https://bucket.s3.amazonaws.com/key → publicBase/bucket/key
  const s3Pattern = new RegExp(`^https://${bucket}\\.s3[^/]*/`);
  if (s3Pattern.test(url)) {
    const key = url.replace(s3Pattern, "");
    return `${publicBase}/${bucket}/${key}`;
  }

  return url;
}

@Controller("api/scenes")
export class ScenesController {
  constructor(
    private readonly scenesService: ScenesService,
    private readonly videoAsset: VideoAssetService,
    private readonly elevenLabs: ElevenLabsService,
  ) {}

  @Post(":sceneId/regenerate-visual")
  @HttpCode(HttpStatus.OK)
  async regenerateVisual(@Param("sceneId") sceneId: string): Promise<{ videoUrl: string }> {
    const { project, scene } = await this.scenesService.findScene(sceneId);

    logger.info({ sceneId, visualPrompt: scene.visualPrompt }, "Regenerating visual for scene");

    const rawUrl = await this.videoAsset.generateVideo({
      visualPrompt: scene.visualPrompt,
      sceneId,
    });

    const videoUrl = toPublicUrl(rawUrl);
    await this.scenesService.updateSceneVideoUrl(project.id, sceneId, videoUrl);

    logger.info({ sceneId, videoUrl }, "Visual regenerated");
    return { videoUrl };
  }

  @Post(":sceneId/update-voice")
  @HttpCode(HttpStatus.OK)
  async updateVoice(@Param("sceneId") sceneId: string): Promise<{ audioUrl: string }> {
    const { project, scene } = await this.scenesService.findScene(sceneId);
    const storyboard = project.storyboard as VideoStoryboard | null;
    const voiceId = storyboard?.meta?.voiceId ?? DEFAULT_VOICE_ID;

    logger.info({ sceneId, voiceId }, "Generating voice for scene");

    const rawUrl = await this.elevenLabs.generateAudio({
      narrationText: scene.narrationText,
      voiceId,
      standardVoiceId: DEFAULT_VOICE_ID,
    });

    const audioUrl = toPublicUrl(rawUrl);
    await this.scenesService.updateSceneAudioUrl(project.id, sceneId, audioUrl);

    logger.info({ sceneId, audioUrl }, "Voice updated");
    return { audioUrl };
  }
}
