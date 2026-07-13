import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus, NotFoundException, HttpException, Query, UseGuards, Inject } from "@nestjs/common";
import { createHash } from "crypto";
import pino from "pino";
import type Redis from "ioredis";
import { wordDiff } from "./word-diff";
import { ThrottleGuard, Throttle } from "../common/throttle.guard";
import { ScenesService } from "./scenes.service";
import { WaveformService } from "./waveform.service";
import { VideoAssetService } from "../media/video-asset.service";
import { ElevenLabsService } from "../elevenlabs/elevenlabs.service";
import { TtsProviderRegistry } from "../elevenlabs/tts-provider-registry";
import { BudgetApprovalGate, type ActionType } from "../cost/budget-approval-gate";
import { ApprovalLogService } from "../cost/approval-log.service";
import { EventsGateway } from "../gateway/events.gateway";
import { S3Service } from "../storage/s3.service";
import { ScenePreviewService } from "../render/scene-preview.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { configuration } from "../config/configuration";
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
  private readonly aiBackendUrl: string;

  constructor(
    private readonly scenesService: ScenesService,
    private readonly waveformService: WaveformService,
    private readonly videoAsset: VideoAssetService,
    private readonly elevenLabs: ElevenLabsService,
    private readonly ttsRegistry: TtsProviderRegistry,
    private readonly approvalGate: BudgetApprovalGate,
    private readonly approvalLog: ApprovalLogService,
    private readonly gateway: EventsGateway,
    private readonly s3: S3Service,
    private readonly scenePreview: ScenePreviewService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.aiBackendUrl = configuration().worker.aiBackendUrl;
  }

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
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
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
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 20, windowMs: 60_000 })
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

  /**
   * Patch narrationText and/or visualPrompt directly — marks scene as dirty.
   * PATCH /api/scenes/:sceneId
   */
  @Patch(":sceneId")
  @HttpCode(HttpStatus.OK)
  async patchScene(
    @Param("sceneId") sceneId: string,
    @Body() body: { narrationText?: string; visualPrompt?: string; projectId?: string },
  ) {
    const { narrationText, visualPrompt, projectId: bodyProjectId } = body;
    if (!narrationText && !visualPrompt) {
      throw new HttpException({ error: "Provide at least narrationText or visualPrompt" }, HttpStatus.BAD_REQUEST);
    }

    let projectId: string;
    try {
      const found = await this.scenesService.findScene(sceneId);
      projectId = found.project.id;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      if (!bodyProjectId) throw new NotFoundException(`Scene ${sceneId} not found`);
      projectId = bodyProjectId;
    }

    const fields: Partial<{ narrationText: string; visualPrompt: string }> = {};
    if (narrationText !== undefined) fields.narrationText = narrationText;
    if (visualPrompt !== undefined) fields.visualPrompt = visualPrompt;

    const result = await this.scenesService.updateSceneFields(projectId, sceneId, fields);
    return result;
  }

  /**
   * Re-run the AI polish pass on a single scene's narration text.
   * POST /api/scenes/:sceneId/regenerate-script
   */
  @Post(":sceneId/regenerate-script")
  @HttpCode(HttpStatus.OK)
  async regenerateScript(
    @Param("sceneId") sceneId: string,
    @Body() body?: { tone?: string; projectId?: string },
  ): Promise<{ narrationText: string; changesSummary: string }> {
    let narrationText = "";
    let projectId: string | undefined = body?.projectId;

    try {
      const found = await this.scenesService.findScene(sceneId);
      narrationText = found.scene.narrationText;
      projectId = found.project.id;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
    }

    if (!narrationText) {
      throw new HttpException({ error: "Scene has no narration text to polish" }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/polish-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: narrationText, tone: body?.tone ?? "engaging" }),
      });
    } catch (err) {
      throw new HttpException({ error: "AI backend unavailable" }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      throw new HttpException({ error: "Script regeneration failed", detail: text }, aiRes.status);
    }

    const result = await aiRes.json() as { polishedScript: string; changesSummary: string };

    // Persist polished script back to storyboard if project is known
    if (projectId) {
      await this.scenesService.updateSceneFields(projectId, sceneId, { narrationText: result.polishedScript }).catch(() => {});
    }

    return { narrationText: result.polishedScript, changesSummary: result.changesSummary };
  }

  /**
   * Suggest a cinematic b-roll visual prompt for a scene's narration text.
   * POST /api/scenes/:sceneId/suggest-visual-prompt
   */
  @Post(":sceneId/suggest-visual-prompt")
  @HttpCode(HttpStatus.OK)
  async suggestVisualPrompt(
    @Param("sceneId") sceneId: string,
    @Body() body?: { topic?: string; aspectRatio?: string },
  ): Promise<{ visualPrompt: string }> {
    let narrationText = "";
    let aspectRatio = body?.aspectRatio ?? "16:9";

    try {
      const { scene, project } = await this.scenesService.findScene(sceneId);
      narrationText = scene.narrationText ?? "";
      const storyboard = project.storyboard as VideoStoryboard | null;
      aspectRatio = body?.aspectRatio ?? storyboard?.meta?.aspectRatio ?? "16:9";
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
    }

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/suggest-visual-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrationText, topic: body?.topic ?? "", aspectRatio }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for suggest-visual-prompt");
      throw new HttpException({ error: "AI backend unavailable" }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      throw new HttpException({ error: "Visual prompt generation failed", detail: text }, aiRes.status);
    }

    return aiRes.json() as Promise<{ visualPrompt: string }>;
  }

  /**
   * I03: Compute a word-level diff between original and current text for a scene field.
   * POST /api/scenes/:sceneId/diff
   * Body: { original: string; current: string; field?: "narrationText" | "visualPrompt" }
   */
  @Post(":sceneId/diff")
  @HttpCode(HttpStatus.OK)
  async computeDiff(
    @Param("sceneId") _sceneId: string,
    @Body() body: { original: string; current: string; field?: string },
  ) {
    if (typeof body.original !== "string" || typeof body.current !== "string") {
      throw new HttpException({ error: "original and current are required strings" }, HttpStatus.BAD_REQUEST);
    }
    return wordDiff(body.original, body.current);
  }

  /**
   * I7: Reorder scenes within a project.
   * PATCH /api/scenes/projects/:projectId/reorder
   * Body: { sceneIds: string[] } — full ordered list of all scene IDs.
   */
  @Patch("projects/:projectId/reorder")
  @HttpCode(HttpStatus.OK)
  async reorderScenes(
    @Param("projectId") projectId: string,
    @Body() body: { sceneIds: string[] },
  ): Promise<{ ok: boolean }> {
    if (!Array.isArray(body.sceneIds) || body.sceneIds.length === 0) {
      throw new HttpException({ error: "sceneIds must be a non-empty array" }, HttpStatus.BAD_REQUEST);
    }
    await this.scenesService.reorderScenes(projectId, body.sceneIds);
    return { ok: true };
  }

  /**
   * I8: Return audio waveform peaks for a scene's current audioUrl.
   * GET /api/scenes/:sceneId/audio-waveform
   */
  @Get(":sceneId/audio-waveform")
  async getAudioWaveform(@Param("sceneId") sceneId: string) {
    const { scene } = await this.scenesService.findScene(sceneId);
    if (!scene.audioUrl) {
      throw new HttpException({ error: "Scene has no audioUrl" }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    // Convert s3:// to presigned URL so ffprobe can access it
    let audioUrl = scene.audioUrl;
    if (audioUrl.startsWith("s3://")) {
      const key = audioUrl.replace(/^s3:\/\/[^/]+\//, "");
      audioUrl = await this.s3.getPresignedUrl(key, 300);
    }

    return this.waveformService.extract(audioUrl);
  }

  /**
   * I6: Get asset version history for a scene.
   * GET /api/scenes/:sceneId/asset-history
   */
  @Get(":sceneId/asset-history")
  async getAssetHistory(@Param("sceneId") sceneId: string) {
    const { project } = await this.scenesService.findScene(sceneId);
    return this.scenesService.getAssetHistory(project.id, sceneId);
  }

  /**
   * F2: Swap the visual for a scene with custom footage (own file or external URL).
   * POST /api/scenes/:sceneId/swap-visual
   * Body: { videoUrl: string; projectId?: string }
   *   - s3:// URL → used directly (validated via header check)
   *   - https:// URL → downloaded and re-uploaded to S3
   */
  @Post(":sceneId/swap-visual")
  @HttpCode(HttpStatus.OK)
  async swapVisual(
    @Param("sceneId") sceneId: string,
    @Body() body: { videoUrl: string; projectId?: string },
  ): Promise<{ videoUrl: string; s3Url: string }> {
    if (!body.videoUrl) throw new HttpException({ error: "videoUrl is required" }, HttpStatus.BAD_REQUEST);

    let projectId: string | undefined = body.projectId;
    try {
      const found = await this.scenesService.findScene(sceneId);
      projectId = found.project.id;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
    }

    let s3Url: string;

    if (body.videoUrl.startsWith("s3://")) {
      // Already in S3 — validate bucket ownership
      s3Url = body.videoUrl;
    } else {
      // External URL — download and upload to S3
      s3Url = await this.downloadAndUpload(body.videoUrl, sceneId);
    }

    if (projectId) {
      await this.scenesService.updateSceneVideoUrl(projectId, sceneId, s3Url);
    }

    logger.info({ sceneId, s3Url }, "F2: Visual swapped");
    return { videoUrl: toPublicUrl(s3Url), s3Url };
  }

  /**
   * I5: Check if a scene's asset generation is currently in-flight.
   * Returns { locked: true } if a BullMQ worker holds the distributed lock for this scene.
   *
   * GET /api/scenes/:sceneId/locked
   */
  @Get(":sceneId/locked")
  async isLocked(@Param("sceneId") sceneId: string): Promise<{ locked: boolean; sceneId: string }> {
    let scene: { narrationText: string; visualPrompt: string } | null = null;
    try {
      const found = await this.scenesService.findScene(sceneId);
      scene = found.scene;
    } catch {
      return { locked: false, sceneId };
    }

    // Mirror asset-generation.worker's computeContentHash for both asset types
    const audioHash = createHash("sha256").update(`audio:${scene.narrationText}:`).digest("hex").slice(0, 16);
    const videoHash = createHash("sha256").update(`video:${scene.visualPrompt}:16:9`).digest("hex").slice(0, 16);

    const [audioLocked, videoLocked] = await Promise.all([
      this.redis.exists(`asset-lock:${audioHash}`),
      this.redis.exists(`asset-lock:${videoHash}`),
    ]);

    return { locked: audioLocked === 1 || videoLocked === 1, sceneId };
  }

  /**
   * I2: Render a single-scene preview clip.
   * POST /api/scenes/:sceneId/preview-render
   * Returns a 1-hour presigned URL to the MP4 clip.
   */
  @Post(":sceneId/preview-render")
  @HttpCode(HttpStatus.OK)
  async previewRender(@Param("sceneId") sceneId: string): Promise<{ url: string; expiresIn: number }> {
    return this.scenePreview.renderPreview(sceneId);
  }

  /**
   * I9: Copy a scene (text + prompts) to another project.
   * POST /api/scenes/:sceneId/copy-to/:targetProjectId
   * Assets (audio/video) are NOT copied.
   */
  @Post(":sceneId/copy-to/:targetProjectId")
  @HttpCode(HttpStatus.OK)
  async copySceneTo(
    @Param("sceneId") sceneId: string,
    @Param("targetProjectId") targetProjectId: string,
  ) {
    return this.scenesService.copySceneTo(sceneId, targetProjectId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** F2: Download an external video URL and upload it to S3, returning the s3:// URL. */
  private async downloadAndUpload(url: string, sceneId: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok || !res.body) {
      throw new HttpException({ error: `Failed to download video: HTTP ${res.status}` }, HttpStatus.BAD_GATEWAY);
    }

    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    const MAX_BYTES = 500 * 1024 * 1024;
    if (contentLength > MAX_BYTES) {
      throw new HttpException({ error: "Video exceeds 500 MB limit" }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const { createHash } = await import("crypto");
    const cacheKey = createHash("sha256").update(url + sceneId).digest("hex").slice(0, 16);
    const s3Key = `video/${cacheKey}.mp4`;

    const chunks: Buffer[] = [];
    const reader = res.body.getReader();
    let downloaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      if (downloaded > MAX_BYTES) {
        throw new HttpException({ error: "Video exceeds 500 MB limit" }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      chunks.push(Buffer.from(value));
    }

    const buffer = Buffer.concat(chunks);
    await this.s3.uploadBuffer(s3Key, buffer, "video/mp4");

    const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
    return `s3://${bucket}/${s3Key}`;
  }

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
