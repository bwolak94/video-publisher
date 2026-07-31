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
      bpm:             track.bpm,
      beatTimestamps:  track.beatTimestamps,
    };
  }

  /**
   * I04: GET /api/projects/:projectId/music/bpm-timestamps
   * Returns beat timestamps for a given mood and duration — used by Remotion
   * to auto-cut scenes on beat without re-generating the track.
   */
  @Get(":projectId/music/bpm-timestamps")
  getBpmTimestamps(
    @Param("projectId") _projectId: string,
    @Body() body: { mood?: MusicMood; durationSeconds?: number },
  ) {
    const mood = body.mood ?? "cinematic";
    const durationSeconds = body.durationSeconds ?? 60;
    const bpm = this.music.annotateBpm({ mood, durationSeconds } as any).bpm ?? 90;
    const beatTimestamps = this.music.beatTimestamps(bpm, durationSeconds);
    return { bpm, beatTimestamps };
  }

  /**
   * S5: POST /api/projects/:projectId/music/snap-to-beats
   * Snaps each scene's durationInSeconds to the nearest beat boundary for the
   * given mood BPM. The caller should then persist the returned durations.
   * Body: { scenes: { sceneId: string; durationInSeconds: number }[]; mood?: MusicMood }
   */
  @Post(":projectId/music/snap-to-beats")
  snapToBeats(
    @Param("projectId") _projectId: string,
    @Body() body: { scenes: { sceneId: string; durationInSeconds: number }[]; mood?: MusicMood },
  ) {
    const mood: MusicMood = VALID_MOODS.includes(body.mood as MusicMood) ? (body.mood as MusicMood) : "cinematic";
    if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
      throw new BadRequestException("scenes must be a non-empty array");
    }
    const snapped = this.music.snapDurationsToBeats(body.scenes, mood);
    return { mood, scenes: snapped };
  }
}
