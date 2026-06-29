import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, HttpException, NotFoundException } from "@nestjs/common";
import pino from "pino";
import { SubtitleService } from "./subtitle.service";
import { ScenesService } from "../scenes/scenes.service";
import type { SubtitleTrack } from "./subtitle.types";

const logger = pino({ level: "info" });

function toPublicUrl(url: string): string {
  const publicBase = process.env.MINIO_PUBLIC_URL;
  if (!publicBase || !url.startsWith("s3://")) return url;
  return `${publicBase}/${url.slice("s3://".length)}`;
}

@Controller("api/scenes")
export class SubtitlesController {
  constructor(
    private readonly subtitleService: SubtitleService,
    private readonly scenesService: ScenesService,
  ) {}

  /** Returns availability of all transcription providers */
  @Get("subtitle-providers")
  async getSubtitleProviders() {
    return this.subtitleService.getProviderStatus();
  }

  /**
   * Transcribe audio for a scene and store the resulting SubtitleTrack.
   * The scene must have an audioUrl already set.
   */
  @Post(":sceneId/generate-subtitles")
  @HttpCode(HttpStatus.OK)
  async generateSubtitles(
    @Param("sceneId") sceneId: string,
    @Body() body?: { language?: string },
  ): Promise<{
    srtUrl: string;
    vttUrl: string;
    wordCount: number;
    language: string;
    provider: string;
  }> {
    const language = body?.language ?? "en";

    // Find the scene to get its audioUrl
    let audioS3Url: string;
    let projectId: string;

    try {
      const { project, scene } = await this.scenesService.findScene(sceneId);
      if (!scene.audioUrl) {
        throw new HttpException(
          {
            error: "No audio found for scene",
            hint: "Generate audio first using the voice generation endpoint.",
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      audioS3Url = scene.audioUrl;
      projectId = project.id;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof NotFoundException) {
        throw new NotFoundException(`Scene ${sceneId} not found`);
      }
      throw err;
    }

    logger.info({ sceneId, audioS3Url, language }, "Generating subtitles");

    let track: SubtitleTrack;
    try {
      track = await this.subtitleService.generate(audioS3Url, language);
    } catch (err: any) {
      const msg = err?.message ?? "transcription_failed";
      logger.error({ sceneId, err: msg }, "Subtitle generation failed");
      throw new HttpException(
        {
          error: "Subtitle generation failed",
          detail: msg,
          hint: "Start the ai-backend service for free local Whisper, or add an OpenAI key in Settings.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Persist subtitle track back to scene storyboard
    await this.scenesService.updateSceneSubtitles(projectId, sceneId, track);

    return {
      srtUrl: toPublicUrl(track.srtS3Url),
      vttUrl: toPublicUrl(track.vttS3Url),
      wordCount: track.words.length,
      language: track.language,
      provider: track.provider,
    };
  }
}
