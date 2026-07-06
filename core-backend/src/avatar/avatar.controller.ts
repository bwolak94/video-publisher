/**
 * AvatarController (FEATURE-11).
 *
 * POST /api/scenes/:sceneId/generate-avatar
 *   → Generate a talking-head video for a specific scene.
 *   Body: { projectId, avatarImageUrl, provider?, avatarId? }
 *   Returns: { videoUrl (public), provider }
 *
 * GET /api/avatar/providers
 *   → List avatar provider availability and scores.
 */
import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import pino from "pino";
import { AvatarService } from "./avatar.service";
import { AvatarProviderRegistry } from "./avatar-provider-registry";
import type { AvatarConfig } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

class GenerateAvatarDto {
  projectId!: string;
  avatarImageUrl!: string;
  provider?: AvatarConfig["provider"];
  avatarId?: string;
  voiceId?: string;
}

function toPublicUrl(url: string): string {
  const base = process.env.MINIO_PUBLIC_URL;
  if (!base) return url;
  if (!url.startsWith("s3://")) return url;
  return `${base}/${url.slice("s3://".length)}`;
}

@Controller()
export class AvatarController {
  constructor(
    private readonly avatarService: AvatarService,
    private readonly registry: AvatarProviderRegistry,
  ) {}

  @Post("api/scenes/:sceneId/generate-avatar")
  @HttpCode(HttpStatus.OK)
  async generateAvatar(
    @Param("sceneId") sceneId: string,
    @Body() dto: GenerateAvatarDto,
  ) {
    const avatarConfig: AvatarConfig = {
      provider: dto.provider ?? "wav2lip_local",
      avatarImageUrl: dto.avatarImageUrl,
      avatarId: dto.avatarId,
      voiceId: dto.voiceId,
    };

    logger.info({ sceneId, provider: avatarConfig.provider }, "Avatar generation requested");

    const result = await this.avatarService.generateAvatar({
      sceneId,
      projectId: dto.projectId,
      avatarConfig,
    });

    return {
      videoUrl: toPublicUrl(result.videoUrl),
      provider: result.provider,
    };
  }

  @Get("api/avatar/providers")
  async getProviders() {
    return this.registry.getProviderStatus();
  }
}
