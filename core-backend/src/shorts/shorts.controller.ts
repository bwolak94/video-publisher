import { Controller, Post, Get, Body, Param, Query, Redirect } from "@nestjs/common";
import { ShortsService } from "./shorts.service";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { T2iService } from "./t2i.service";
import { FinalizeService } from "./finalize.service";
import { LipsyncService } from "./lipsync.service";
import { V2VService, GenerateV2VDto } from "./v2v.service";

@Controller("shorts")
export class ShortsController {
  constructor(
    private readonly shortsService: ShortsService,
    private readonly t2iService: T2iService,
    private readonly finalizeService: FinalizeService,
    private readonly lipsyncService: LipsyncService,
    private readonly v2vService: V2VService,
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
   * Starts I2V generation for all keyframe-accepted scenes.
   * Enqueues BullMQ workers and transitions job to 'generating_i2v'.
   * POST /shorts/:jobId/start
   */
  @Post(":jobId/start")
  startI2V(@Param("jobId") jobId: string) {
    return this.shortsService.startI2V(jobId);
  }

  /**
   * Re-enqueues I2V generation for a single scene (per-scene retry).
   * POST /shorts/:jobId/scenes/:sceneId/generate-i2v
   */
  @Post(":jobId/scenes/:sceneId/generate-i2v")
  generateSceneI2V(
    @Param("jobId") jobId: string,
    @Param("sceneId") sceneId: string,
  ) {
    return this.shortsService.generateSceneI2V(jobId, sceneId);
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

  /**
   * Finalize a shorts job: builds C2PA manifest for accepted clips, uploads
   * manifest sidecar to S3, and marks the job as done.
   * POST /shorts/:jobId/finalize
   */
  @Post(":jobId/finalize")
  finalizeJob(@Param("jobId") jobId: string) {
    return this.finalizeService.finalizeJob(jobId);
  }

  /**
   * Generate lip-synced audio + video for a single scene (FR-21).
   * POST /shorts/:jobId/scenes/:sceneId/generate-lipsync
   */
  @Post(":jobId/scenes/:sceneId/generate-lipsync")
  generateLipsync(
    @Param("jobId") jobId: string,
    @Param("sceneId") sceneId: string,
    @Body() body: { dialog: string; voiceId: string },
  ) {
    return this.lipsyncService.generateLipsync({
      jobId,
      sceneId,
      clipS3Url: "",
      dialog: body.dialog,
      voiceId: body.voiceId,
    });
  }

  /**
   * Generate a V2V clip for a scene using fal.ai wan/video-to-video (FR-14).
   * POST /shorts/:jobId/scenes/:sceneId/generate-v2v
   */
  @Post(":jobId/scenes/:sceneId/generate-v2v")
  generateV2V(
    @Param("jobId") jobId: string,
    @Param("sceneId") sceneId: string,
    @Body() dto: GenerateV2VDto,
  ) {
    return this.v2vService.generateV2V(jobId, sceneId, dto);
  }

  /**
   * Human QA gate — approve a scene clip (FIX-03).
   * POST /shorts/:jobId/scenes/:sceneId/approve-qa
   */
  @Post(':jobId/scenes/:sceneId/approve-qa')
  async approveQA(@Param('jobId') jobId: string, @Param('sceneId') sceneId: string) {
    return this.shortsService.approveQA(jobId, sceneId);
  }

  /**
   * Human QA gate — reject a scene clip and trigger re-generation (FIX-03).
   * POST /shorts/:jobId/scenes/:sceneId/reject-qa
   */
  @Post(':jobId/scenes/:sceneId/reject-qa')
  async rejectQA(
    @Param('jobId') jobId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: { reason?: string },
  ) {
    return this.shortsService.rejectQA(jobId, sceneId, body?.reason);
  }
}
