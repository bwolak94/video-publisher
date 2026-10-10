import { Controller, Post, Get, Body, Param, Query, Redirect } from "@nestjs/common";
import { ShortsService } from "./shorts.service";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { T2iService } from "./t2i.service";

@Controller("shorts")
export class ShortsController {
  constructor(
    private readonly shortsService: ShortsService,
    private readonly t2iService: T2iService,
  ) {}

  @Get()
  listJobs(@Query("limit") limit?: string) {
    return this.shortsService.listJobs(limit ? parseInt(limit, 10) : 20);
  }

  @Get(":jobId")
  getJob(@Param("jobId") jobId: string) {
    return this.shortsService.findJob(jobId);
  }

  @Get(":jobId/status")
  getJobStatus(@Param("jobId") jobId: string) {
    return this.shortsService.getJobStatus(jobId);
  }

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

  /**
   * Redirects to a presigned download URL for the final MP4 of a completed job.
   * GET /shorts/:jobId/download
   */
  @Get(":jobId/download")
  @Redirect()
  async downloadShort(@Param("jobId") jobId: string) {
    const url = await this.shortsService.getDownloadUrl(jobId);
    return { url, statusCode: 302 };
  }

  /**
   * Resumes a shorts job that has QA-failed clips.
   * Sets the job status back to 'generating' and returns the first failed scene_id.
   * POST /shorts/:jobId/resume
   */
  @Post(":jobId/resume")
  resumeJob(@Param("jobId") jobId: string) {
    return this.shortsService.resumeJob(jobId);
  }
}
