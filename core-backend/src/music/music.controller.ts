import { Controller, Get, Post, Body, Param, BadRequestException } from "@nestjs/common";
import { MusicService } from "./music.service";
import type { MusicMood } from "./music.types";

const VALID_MOODS: MusicMood[] = ["cinematic", "upbeat", "calm", "dramatic", "inspiring", "fun"];

interface GenerateMusicDto {
  mood: MusicMood;
  durationSeconds?: number;
}

@Controller("api/projects")
export class MusicController {
  constructor(private readonly music: MusicService) {}

  /**
   * GET /api/music/providers
   * Returns status of all registered music providers.
   */
  @Get("/music/providers")
  async getProviders() {
    return this.music.getProviderStatus();
  }

  /**
   * POST /api/projects/:projectId/music/generate
   * Generate or retrieve background music for a project.
   */
  @Post(":projectId/music/generate")
  async generate(
    @Param("projectId") projectId: string,
    @Body() body: GenerateMusicDto,
  ) {
    const mood = body.mood ?? "cinematic";
    if (!VALID_MOODS.includes(mood)) {
      throw new BadRequestException(`Invalid mood. Must be one of: ${VALID_MOODS.join(", ")}`);
    }

    const durationSeconds = body.durationSeconds ?? 60;

    const track = await this.music.generate({ mood, durationSeconds, projectId });

    return {
      s3Url:           track.s3Url,
      provider:        track.provider,
      mood:            track.mood,
      title:           track.title,
      artist:          track.artist,
      license:         track.license,
      durationSeconds: track.durationSeconds,
      generatedAt:     track.generatedAt,
    };
  }
}
