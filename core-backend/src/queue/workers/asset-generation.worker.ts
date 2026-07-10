import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import { createHash } from "crypto";
import pino from "pino";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { JobSyncService } from "../job-sync.service";
import { DlqAlertService } from "../dlq-alert.service";
import { EventsGateway } from "../../gateway/events.gateway";
import { QUEUE_CONCURRENCY, RESEARCH_WORKER_SETTINGS } from "../queue.config";
import { ElevenLabsService } from "../../elevenlabs/elevenlabs.service";
import { VideoAssetService } from "../../media/video-asset.service";
import { ImageAssetService } from "../../images/image-asset.service";
import { BudgetService } from "../../cost/budget.service";
import { CostRecordService } from "../../cost/cost-record.service";
import { CostConfigService } from "../../cost/cost-config.service";
import { DlqService } from "../dlq.service";
import { MetricsService } from "../../metrics/metrics.service";
import { AssetDedupService } from "../asset-dedup.service";
import { RateLimiterService } from "../../common/rate-limiter.service";

const logger = pino({ level: "info" });
const QUEUE_NAME = "asset-generation";
const MAX_ATTEMPTS = 3;

export interface AssetGenerationPayload {
  jobId: string;
  projectId: string;
  sceneId: string;
  step: string;
  assetType?: "audio" | "video" | "image"; // PRD section 5.2
  narrationText?: string;
  voiceId?: string;
  standardVoiceId?: string;
  visualPrompt?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  stability?: number;
  similarityBoost?: number;
  style?: number;
  // Budget tracking (TASK-25)
  channelId?: string;
  estimatedCostUsd?: number;
  // Observability
  correlationId?: string;
  /** I6: W3C Trace Context traceparent header, propagated from originating HTTP request */
  traceparent?: string;
}

/** I10: Return value from process() carrying the actual provider used. */
export interface AssetGenerationResult {
  videoProvider?: string;
}

@Injectable()
export class AssetGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly jobSync: JobSyncService,
    private readonly dlqAlert: DlqAlertService,
    private readonly gateway: EventsGateway,
    private readonly elevenLabs: ElevenLabsService,
    private readonly videoAsset: VideoAssetService,
    private readonly imageAsset: ImageAssetService,
    private readonly budget: BudgetService,
    private readonly costRecord: CostRecordService,
    private readonly costConfig: CostConfigService,
    private readonly dlq: DlqService,
    private readonly metrics: MetricsService,
    private readonly dedup: AssetDedupService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<AssetGenerationPayload>) => this.process(job),
      {
        connection: this.redis as any,
        concurrency: QUEUE_CONCURRENCY[QUEUE_NAME],
        stalledInterval: RESEARCH_WORKER_SETTINGS.stalledInterval,
        maxStalledCount: RESEARCH_WORKER_SETTINGS.maxStalledCount,
      }
    );

    this.worker.on("active", (job) => this.onActive(job));
    this.worker.on("completed", (job, result) => this.onCompleted(job, result));
    this.worker.on("failed", (job, err) => this.onFailed(job, err));
    this.worker.on("progress", (job, progress) => this.onProgress(job, progress as number | object));
    this.worker.on("stalled", (jobId) => this.onStalled(jobId));
  }

  async onModuleDestroy() {
    if (!this.worker) return;
    // I1: Wait up to 30s for in-flight jobs to complete before forcing close
    const graceful = this.worker.close(false);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    await Promise.race([graceful, timeout]);
  }

  // ── Job processor ──────────────────────────────────────────────────────────

  private async process(job: Job<AssetGenerationPayload>): Promise<AssetGenerationResult> {
    const {
      sceneId, assetType, narrationText, voiceId, standardVoiceId,
      visualPrompt, aspectRatio, stability, similarityBoost, style,
      correlationId, traceparent,
    } = job.data;

    logger.info({ jobId: job.id, sceneId, assetType, correlationId, traceparent }, "Processing asset generation");

    // Jitter before starting (per task rule #2)
    await this.sleep(Math.random() * 500);

    let videoProvider: string | undefined;

    // I2: Acquire distributed lock per content hash to prevent duplicate generation
    const contentHash = this.computeContentHash(job.data);
    const holderId = `worker-${job.id}`;
    const lockResult = await this.dedup.acquireOrSkip(contentHash, holderId);

    if (lockResult === "skip") {
      logger.info({ sceneId, contentHash }, "I2: Duplicate generation skipped — cache should be warm");
      await job.updateProgress(100);
      return {};
    }

    try {
      // Parallel: audio (ElevenLabs) + visual (image or video based on assetType)
      const [, visualResult] = await Promise.all([
        narrationText && voiceId && standardVoiceId
          ? this.generateAudio(narrationText, voiceId, standardVoiceId, { stability, similarityBoost, style })
          : Promise.resolve(null),
        assetType === "image" && visualPrompt
          ? this.generateImage(visualPrompt, sceneId, aspectRatio).then((url) => ({ s3Url: url, provider: "dalle3" }))
          : visualPrompt
            ? this.generateVideoWithProvider(visualPrompt, sceneId, aspectRatio)
            : Promise.resolve(null),
      ]);

      videoProvider = visualResult?.provider;
    } finally {
      await this.dedup.release(contentHash, holderId);
    }

    await job.updateProgress(100);
    return { videoProvider };
  }

  protected async generateAudio(
    text: string,
    voiceId: string,
    standardVoiceId: string,
    params: Pick<AssetGenerationPayload, "stability" | "similarityBoost" | "style">
  ): Promise<string> {
    await this.rateLimiter.throttle("elevenlabs"); // I3
    return this.elevenLabs.generateAudio({
      narrationText: text,
      voiceId,
      standardVoiceId,
      ...params,
    });
  }

  /** I10: Returns both s3Url and provider name for cost reconciliation. */
  protected async generateVideoWithProvider(
    prompt: string,
    sceneId: string,
    aspectRatio?: "16:9" | "9:16" | "1:1"
  ): Promise<{ s3Url: string; provider: string }> {
    await this.rateLimiter.throttle("runway"); // I3: default to runway limit; registry picks actual provider
    return this.videoAsset.generateVideo({
      visualPrompt: prompt,
      sceneId,
      aspectRatio: aspectRatio === "1:1" ? "16:9" : aspectRatio,
    });
  }

  protected async generateVideo(
    prompt: string,
    sceneId: string,
    aspectRatio?: "16:9" | "9:16" | "1:1"
  ): Promise<string> {
    const result = await this.generateVideoWithProvider(prompt, sceneId, aspectRatio);
    return result.s3Url;
  }

  protected async generateImage(
    prompt: string,
    sceneId: string,
    aspectRatio?: "16:9" | "9:16" | "1:1"
  ): Promise<string> {
    return this.imageAsset.generateImage({ visualPrompt: prompt, sceneId, aspectRatio });
  }

  // ── Lifecycle event handlers ───────────────────────────────────────────────

  private async onActive(job: Job<AssetGenerationPayload>) {
    await this.jobSync.syncActive(job.data.jobId);
  }

  private async onCompleted(job: Job<AssetGenerationPayload>, result: AssetGenerationResult) {
    await this.jobSync.syncCompleted(job.data.jobId);
    void this.gateway.broadcastJobProgress(job.data.projectId, {
      jobId: job.data.jobId,
      step: job.data.step,
      status: "completed",
      sceneId: job.data.sceneId,
    } as any);

    // Increment channel spend after successful completion (Rule #6 — only on completed)
    if (job.data.channelId && job.data.estimatedCostUsd) {
      await this.budget.incrementSpend(job.data.channelId, job.data.estimatedCostUsd);
    }

    // I10: Record per-asset cost using actual provider and its real rate
    if (job.data.projectId && job.data.estimatedCostUsd) {
      const actualProvider = this.resolveActualProvider(job.data, result);
      const actualCostUsd = this.computeActualCost(job.data, actualProvider);

      await this.costRecord.record({
        projectId:       job.data.projectId,
        sceneId:         job.data.sceneId,
        assetType:       job.data.assetType ?? "video",
        provider:        actualProvider,
        estimatedCostUsd: job.data.estimatedCostUsd,
        actualCostUsd,
      });
    }
  }

  private async onFailed(job: Job<AssetGenerationPayload> | undefined, err: Error) {
    if (!job) return;
    await this.jobSync.syncFailed(job.data.jobId, err);
    void this.gateway.broadcastJobProgress(job.data.projectId, {
      jobId: job.data.jobId,
      step: job.data.step,
      status: "failed",
    });

    if ((job.attemptsMade ?? 0) >= MAX_ATTEMPTS) {
      await this.dlqAlert.alert(job.data.jobId, QUEUE_NAME, err);
      await this.dlq.enqueue(QUEUE_NAME, job.data as any, err, job.attemptsMade ?? 0);
      this.metrics.dlqDepth.inc({ queue: QUEUE_NAME });
    }
  }

  private onProgress(job: Job<AssetGenerationPayload>, progress: number | object) {
    void this.gateway.broadcastJobProgress(job.data.projectId, {
      jobId: job.data.jobId,
      step: job.data.step,
      status: "progress",
      progress,
    } as any);
  }

  private async onStalled(jobId: string) {
    logger.warn({ jobId, queue: QUEUE_NAME }, "Job stalled — will be re-queued");
    await this.jobSync.syncStalled(jobId);
  }

  // ── I2: Content hash ────────────────────────────────────────────────────────

  private computeContentHash(data: AssetGenerationPayload): string {
    const key = data.assetType === "audio"
      ? `audio:${data.narrationText ?? ""}:${data.voiceId ?? ""}`
      : `video:${data.visualPrompt ?? ""}:${data.aspectRatio ?? "16:9"}`;
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  // ── I10: Cost reconciliation ────────────────────────────────────────────────

  /** Determine the provider actually used (video may differ from estimate if fallback occurred). */
  private resolveActualProvider(data: AssetGenerationPayload, result: AssetGenerationResult): string {
    if (data.assetType === "audio") return "elevenlabs";
    if (data.assetType === "image") return "dalle3";
    return result.videoProvider ?? "runway"; // fallback to runway if not captured
  }

  /** Look up the per-unit rate for the actual provider and compute cost. */
  private computeActualCost(data: AssetGenerationPayload, provider: string): number {
    const config = this.costConfig.get();
    if (data.assetType === "audio") {
      return (data.narrationText?.length ?? 0) * config.elevenlabsPerCharUsd;
    }
    if (data.assetType === "image") {
      return config.dalle3PerImageUsd;
    }
    // Video: pexels is free, everything else uses runway rate
    return provider === "pexels" || provider === "archival"
      ? config.pexelsPerSceneUsd
      : config.runwayPerSceneUsd;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
