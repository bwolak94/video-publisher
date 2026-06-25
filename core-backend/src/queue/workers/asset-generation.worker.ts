import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { JobSyncService } from "../job-sync.service";
import { DlqAlertService } from "../dlq-alert.service";
import { EventsGateway } from "../../gateway/events.gateway";
import { QUEUE_CONCURRENCY, RESEARCH_WORKER_SETTINGS } from "../queue.config";
import { ElevenLabsService } from "../../elevenlabs/elevenlabs.service";
import { VideoAssetService } from "../../media/video-asset.service";
import { ImageAssetService } from "../../images/image-asset.service";
import { BudgetService } from "../../cost/budget.service";

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
}

@Injectable()
export class AssetGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly jobSync: JobSyncService,
    private readonly dlqAlert: DlqAlertService,
    private readonly gateway: EventsGateway,
    private readonly elevenLabs: ElevenLabsService,
    private readonly videoAsset: VideoAssetService,
    private readonly imageAsset: ImageAssetService,
    private readonly budget: BudgetService
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<AssetGenerationPayload>) => this.process(job),
      {
        connection: this.redis,
        concurrency: QUEUE_CONCURRENCY[QUEUE_NAME],
        stalledInterval: RESEARCH_WORKER_SETTINGS.stalledInterval,
        maxStalledCount: RESEARCH_WORKER_SETTINGS.maxStalledCount,
      }
    );

    this.worker.on("active", (job) => this.onActive(job));
    this.worker.on("completed", (job) => this.onCompleted(job));
    this.worker.on("failed", (job, err) => this.onFailed(job, err));
    this.worker.on("progress", (job, progress) => this.onProgress(job, progress as number | object));
    this.worker.on("stalled", (jobId) => this.onStalled(jobId));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  // ── Job processor ──────────────────────────────────────────────────────────

  private async process(job: Job<AssetGenerationPayload>): Promise<void> {
    const {
      sceneId, assetType, narrationText, voiceId, standardVoiceId,
      visualPrompt, aspectRatio, stability, similarityBoost, style,
    } = job.data;

    logger.info({ jobId: job.id, sceneId, assetType }, "Processing asset generation");

    // Jitter before starting (per task rule #2)
    await this.sleep(Math.random() * 500);

    // Parallel: audio (ElevenLabs) + visual (image or video based on assetType)
    await Promise.all([
      narrationText && voiceId && standardVoiceId
        ? this.generateAudio(narrationText, voiceId, standardVoiceId, { stability, similarityBoost, style })
        : Promise.resolve(),
      assetType === "image" && visualPrompt
        ? this.generateImage(visualPrompt, sceneId, aspectRatio)
        : visualPrompt
          ? this.generateVideo(visualPrompt, sceneId, aspectRatio)
          : Promise.resolve(),
    ]);

    await job.updateProgress(100);
  }

  protected async generateAudio(
    text: string,
    voiceId: string,
    standardVoiceId: string,
    params: Pick<AssetGenerationPayload, "stability" | "similarityBoost" | "style">
  ): Promise<string> {
    return this.elevenLabs.generateAudio({
      narrationText: text,
      voiceId,
      standardVoiceId,
      ...params,
    });
  }

  protected async generateVideo(
    prompt: string,
    sceneId: string,
    aspectRatio?: "16:9" | "9:16" | "1:1"
  ): Promise<string> {
    return this.videoAsset.generateVideo({
      visualPrompt: prompt,
      sceneId,
      aspectRatio: aspectRatio === "1:1" ? "16:9" : aspectRatio, // video doesn't support 1:1
    });
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

  private async onCompleted(job: Job<AssetGenerationPayload>) {
    await this.jobSync.syncCompleted(job.data.jobId);
    this.gateway.broadcastJobProgress(job.data.projectId, {
      jobId: job.data.jobId,
      step: job.data.step,
      status: "completed",
      sceneId: job.data.sceneId,
    } as any);

    // Increment channel spend after successful completion (Rule #6 — only on completed)
    if (job.data.channelId && job.data.estimatedCostUsd) {
      await this.budget.incrementSpend(job.data.channelId, job.data.estimatedCostUsd);
    }
  }

  private async onFailed(job: Job<AssetGenerationPayload> | undefined, err: Error) {
    if (!job) return;
    await this.jobSync.syncFailed(job.data.jobId, err);
    this.gateway.broadcastJobProgress(job.data.projectId, {
      jobId: job.data.jobId,
      step: job.data.step,
      status: "failed",
    });

    if ((job.attemptsMade ?? 0) >= MAX_ATTEMPTS) {
      await this.dlqAlert.alert(job.data.jobId, QUEUE_NAME, err);
    }
  }

  private onProgress(job: Job<AssetGenerationPayload>, progress: number | object) {
    this.gateway.broadcastJobProgress(job.data.projectId, {
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

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
