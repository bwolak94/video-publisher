import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, NotFoundException, HttpException } from "@nestjs/common";
import pino from "pino";
import { ScenesService } from "./scenes.service";
import { VideoAssetService } from "../media/video-asset.service";
import { ElevenLabsService } from "../elevenlabs/elevenlabs.service";
import { TtsProviderRegistry } from "../elevenlabs/tts-provider-registry";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — ElevenLabs default

/**
 * Convert an internal S3/MinIO URL to a browser-accessible public URL.
 */
function toPublicUrl(url: string): string {
  const publicBase = process.env.MINIO_PUBLIC_URL;
  if (!publicBase) return url;

  const bucket = process.env.S3_BUCKET ?? process.env.S3_BUCKET_NAME ?? "video-publisher-assets";

  if (url.startsWith("s3://")) {
    return `${publicBase}/${url.slice("s3://".length)}`;
  }

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
    private readonly ttsRegistry: TtsProviderRegistry,
  ) {}

  /** Returns all registered providers and their availability + scores */
  @Get("video-providers")
  async getVideoProviders() {
    return this.videoAsset.getProviderStatus();
  }

  @Post(":sceneId/regenerate-visual")
  @HttpCode(HttpStatus.OK)
  async regenerateVisual(
    @Param("sceneId") sceneId: string,
    @Body() body?: { visualPrompt?: string; projectId?: string; aspectRatio?: "16:9" | "9:16" },
  ): Promise<{ videoUrl: string; provider: string }> {
    let visualPrompt: string;
    let projectId: string | undefined;

    try {
      const found = await this.scenesService.findScene(sceneId);
      visualPrompt = body?.visualPrompt ?? found.scene.visualPrompt;
      projectId = found.project.id;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      if (!body?.visualPrompt) throw new NotFoundException(`Scene ${sceneId} not found and no visualPrompt provided`);
      visualPrompt = body.visualPrompt;
      projectId = body.projectId;
    }

    logger.info({ sceneId, visualPrompt }, "Regenerating visual for scene");

    let result: { s3Url: string; provider: string };
    try {
      result = await this.videoAsset.generateVideo({
        visualPrompt,
        sceneId,
        aspectRatio: body?.aspectRatio,
      });
    } catch (err: any) {
      const msg = err?.reason ?? err?.message ?? "asset_generation_failed";
      logger.error({ sceneId, err: msg }, "Video generation failed");
      throw new HttpException(
        { error: "Video generation failed", detail: msg, hint: "Add at least one video provider key in Settings (Runway, Pexels, or Kling). Archival footage is free and needs no key." },
        503,
      );
    }

    const videoUrl = toPublicUrl(result.s3Url);

    if (projectId) {
      // Store s3:// in DB (render worker needs it); also store provider name
      await this.scenesService.updateSceneVideoUrl(projectId, sceneId, result.s3Url, result.provider);
    }

    logger.info({ sceneId, videoUrl, provider: result.provider }, "Visual regenerated");
    return { videoUrl, provider: result.provider };
  }

  @Post(":sceneId/set-video-url")
  @HttpCode(HttpStatus.OK)
  async setVideoUrl(
    @Param("sceneId") sceneId: string,
    @Body() body: { videoUrl: string; projectId?: string },
  ): Promise<{ videoUrl: string }> {
    try {
      const { project } = await this.scenesService.findScene(sceneId);
      await this.scenesService.updateSceneVideoUrl(project.id, sceneId, body.videoUrl);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      // Scene not in DB — skip DB update, just return the URL
    }
    return { videoUrl: body.videoUrl };
  }

  @Post(":sceneId/update-voice")
  @HttpCode(HttpStatus.OK)
  async updateVoice(
    @Param("sceneId") sceneId: string,
    @Body() body?: { voiceId?: string; narrationText?: string; projectId?: string },
  ): Promise<{ audioUrl: string }> {
    let narrationText: string;
    let voiceId: string;
    let projectId: string | undefined;

    try {
      const found = await this.scenesService.findScene(sceneId);
      const storyboard = found.project.storyboard as VideoStoryboard | null;
      narrationText = body?.narrationText ?? found.scene.narrationText;
      voiceId = body?.voiceId ?? storyboard?.meta?.voiceId ?? DEFAULT_VOICE_ID;
      projectId = found.project.id;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      if (!body?.narrationText) throw new NotFoundException(`Scene ${sceneId} not found and no narrationText provided`);
      narrationText = body.narrationText;
      voiceId = body?.voiceId ?? DEFAULT_VOICE_ID;
      projectId = body.projectId;
    }

    logger.info({ sceneId, voiceId }, "Generating voice for scene");

    let rawUrl: string;
    try {
      rawUrl = await this.ttsRegistry.generateAudio({
        narrationText,
        voiceId,
        standardVoiceId: DEFAULT_VOICE_ID,
      });
    } catch (err: any) {
      const msg = err?.message ?? "tts_failed";
      logger.error({ sceneId, err: msg }, "TTS generation failed");
      const isPiper = voiceId.startsWith("piper_");
      throw new HttpException(
        {
          error: "Voice generation failed",
          detail: msg,
          hint: isPiper
            ? "Check that piper is installed and PIPER_MODELS_DIR contains the requested .onnx model."
            : "Check ElevenLabs API key in Settings.",
        },
        503,
      );
    }

    const audioUrl = toPublicUrl(rawUrl);

    if (projectId) {
      // Store the s3:// URL in DB so the render worker can process it
      await this.scenesService.updateSceneAudioUrl(projectId, sceneId, rawUrl);
    }

    logger.info({ sceneId, audioUrl }, "Voice updated");
    return { audioUrl };
  }
}
