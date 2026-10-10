import { Controller, Post, Body, Param } from "@nestjs/common";
import { ShortsService } from "./shorts.service";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { T2iService } from "./t2i.service";

@Controller("shorts")
export class ShortsController {
  constructor(
    private readonly shortsService: ShortsService,
    private readonly t2iService: T2iService,
  ) {}

  @Post("brief")
  async createBrief(@Body() dto: CreateBriefDto) {
    return this.shortsService.generateScenePlan(dto);
  }

  /**
   * Generate 2 keyframe image variants for a scene via Flux/fal.ai.
   * POST /shorts/:jobId/scenes/:sceneId/generate-keyframe
   */
  @Post(":jobId/scenes/:sceneId/generate-keyframe")
  generateKeyframe(
    @Param("jobId") jobId: string,
    @Param("sceneId") sceneId: string,
  ) {
    return this.t2iService.generateKeyframes(jobId, sceneId);
  }

  /**
   * Mark a specific variant as accepted.
   * POST /shorts/:jobId/scenes/:sceneId/accept-keyframe
   */
  @Post(":jobId/scenes/:sceneId/accept-keyframe")
  acceptKeyframe(
    @Param("jobId") jobId: string,
    @Param("sceneId") sceneId: string,
    @Body() body: { variantId: string },
  ) {
    return this.t2iService.acceptKeyframe(jobId, sceneId, body.variantId);
  }

  /**
   * Regenerate keyframe variants (generates two fresh variants, independent of
   * prior attempts).
   * POST /shorts/:jobId/scenes/:sceneId/regenerate-keyframe
   */
  @Post(":jobId/scenes/:sceneId/regenerate-keyframe")
  regenerateKeyframe(
    @Param("jobId") jobId: string,
    @Param("sceneId") sceneId: string,
  ) {
    return this.t2iService.generateKeyframes(jobId, sceneId);
  }
}
