import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, NotFoundException, HttpException, Query } from "@nestjs/common";
import pino from "pino";
import { ScenesService } from "./scenes.service";
import { VideoAssetService } from "../media/video-asset.service";
import { ElevenLabsService } from "../elevenlabs/elevenlabs.service";
import { TtsProviderRegistry } from "../elevenlabs/tts-provider-registry";
import { BudgetApprovalGate, type ActionType } from "../cost/budget-approval-gate";
import { ApprovalLogService } from "../cost/approval-log.service";
import { EventsGateway } from "../gateway/events.gateway";
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
    private readonly approvalGate: BudgetApprovalGate,
    private readonly approvalLog: ApprovalLogService,
    private readonly gateway: EventsGateway,
  ) {}

  /** Returns all registered providers and their availability + scores */
  @Get("video-providers")
  async getVideoProviders() {
    return this.videoAsset.getProviderStatus();
  }

  /**
   * Estimate cost for a scene action (FEATURE-09).
   * GET /api/scenes/:sceneId/cost-estimate?action=regenerate_visual
   */
  @Get(":sceneId/cost-estimate")
  async getCostEstimate(
    @Param("sceneId") sceneId: string,
    @Query("action") action: ActionType = "regenerate_visual",
  ): Promise<{ estimatedCost: number; provider: string; requiresApproval: boolean; threshold: number }> {
    let narrationTextLength = 0;
    try {
      const found = await this.scenesService.findScene(sceneId);
      narrationTextLength = found.scene.narrationText.length;
    } catch {
      // Scene not in DB — use default
    }

    const estimate = this.approvalGate.estimateAction(action, { narrationTextLength });
    return { ...estimate, threshold: this.approvalGate.getThreshold() };
  }

  /**
   * Approve a pending action (FEATURE-09).
   * POST /api/scenes/approval/:jobId/approve
   */
  @Post("approval/:jobId/approve")
  @HttpCode(HttpStatus.OK)
  approveAction(@Param("jobId") jobId: string): { ok: boolean } {
    const resolved = this.approvalGate.approveJob(jobId);
    if (!resolved) {
      throw new HttpException({ error: "Unknown or expired jobId" }, 404);
    }
    return { ok: true };
  }

  /**
   * Reject a pending action (FEATURE-09).
   * POST /api/scenes/approval/:jobId/reject
   */
  @Post("approval/:jobId/reject")
  @HttpCode(HttpStatus.OK)
  rejectAction(@Param("jobId") jobId: string): { ok: boolean } {
    const resolved = this.approvalGate.rejectJob(jobId);
    if (!resolved) {
      throw new HttpException({ error: "Unknown or expired jobId" }, 404);
    }
    return { ok: true };
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

    // Budget approval gate (FEATURE-09)
    const estimate = this.approvalGate.estimateAction("regenerate_visual", {});
    const approvedBy = await this.runApprovalGate(estimate, "regenerate_visual", sceneId, projectId);
    if (approvedBy === "rejected") {
      throw new HttpException({ error: "Action rejected by user" }, 402);
    }

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
      await this.approvalLog.log({
        projectId,
        sceneId,
        action: "regenerate_visual",
        provider: result.provider,
        estimatedCost: estimate.estimatedCost,
        approvedBy: approvedBy === "auto" ? "auto" : "user",
        decision: "approved",
      }).catch(() => {});
      if (estimate.estimatedCost > 0) {
        await this.approvalLog.incrementProjectSpend(projectId, estimate.estimatedCost).catch(() => {});
      }
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

    // Budget approval gate (FEATURE-09)
    const voiceEstimate = this.approvalGate.estimateAction("update_voice", {
      narrationTextLength: narrationText.length,
      provider: voiceId,
    });
    const approvedBy = await this.runApprovalGate(voiceEstimate, "update_voice", sceneId, projectId);
    if (approvedBy === "rejected") {
      throw new HttpException({ error: "Action rejected by user" }, 402);
    }

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
      await this.approvalLog.log({
        projectId,
        sceneId,
        action: "update_voice",
        provider: voiceId,
        estimatedCost: voiceEstimate.estimatedCost,
        approvedBy: approvedBy === "auto" ? "auto" : "user",
        decision: "approved",
      }).catch(() => {});
    }

    logger.info({ sceneId, audioUrl }, "Voice updated");
    return { audioUrl };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Check estimate against threshold.
   * - Under threshold → "auto" (proceed immediately)
   * - Over threshold → emit WS event, await user decision
   * - Returns "auto" | "user" | "rejected"
   */
  private async runApprovalGate(
    estimate: { estimatedCost: number; provider: string; requiresApproval: boolean },
    action: ActionType,
    sceneId: string,
    projectId: string | undefined,
  ): Promise<"auto" | "user" | "rejected"> {
    if (!estimate.requiresApproval) return "auto";
    if (!projectId) return "auto"; // No project context → skip gate (e.g. stateless call)

    const jobId = this.approvalGate.createJobId();
    const pending = this.approvalGate.createPendingApproval(jobId);

    this.gateway.emitApprovalRequired(projectId, {
      jobId,
      estimatedCost: estimate.estimatedCost,
      provider: estimate.provider,
      action,
      sceneId,
    });

    try {
      await pending;
      return "user";
    } catch {
      // Rejected or timed out
      await this.approvalLog.log({
        projectId,
        sceneId,
        action,
        provider: estimate.provider,
        estimatedCost: estimate.estimatedCost,
        approvedBy: "user",
        decision: "rejected",
      }).catch(() => {});
      return "rejected";
    }
  }
}
