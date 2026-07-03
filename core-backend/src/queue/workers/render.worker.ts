import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { JobSyncService } from "../job-sync.service";
import { DlqAlertService } from "../dlq-alert.service";
import { DlqService } from "../dlq.service";
import { EventsGateway } from "../../gateway/events.gateway";
import { QUEUE_CONCURRENCY, RESEARCH_WORKER_SETTINGS } from "../queue.config";
import { RenderService } from "../../render/render.service";
import { VideoStoryboard } from "../../storyboard/video-storyboard";
import { MetricsService } from "../../metrics/metrics.service";
import { PreRenderValidatorService } from "../../quality/pre-render-validator.service";
import { QualityGatesService } from "../../quality/quality-gates.service";

const logger = pino({ level: "info" });
const QUEUE_NAME = "render";
const MAX_ATTEMPTS = 3;

export interface RenderPayload {
  jobId: string;
  projectId: string;
  step: string;
  storyboard: VideoStoryboard;
  outputFormat?: string;
}

@Injectable()
export class RenderWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly jobSync: JobSyncService,
    private readonly dlqAlert: DlqAlertService,
    private readonly dlq: DlqService,
    private readonly gateway: EventsGateway,
    private readonly renderService: RenderService,
    private readonly metrics: MetricsService,
    private readonly preRenderValidator: PreRenderValidatorService,
    private readonly qualityGates: QualityGatesService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<RenderPayload>) => this.process(job),
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
    this.worker.on("stalled", (jobId) => this.onStalled(jobId));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  // ── Job processor ──────────────────────────────────────────────────────────

  private async process(job: Job<RenderPayload>): Promise<void> {
    logger.info({ jobId: job.id, projectId: job.data.projectId }, "Dispatching render");

    // ── Pre-render validation (FEATURE-07) ────────────────────────────────
    const validation = await this.preRenderValidator.validate(job.data.storyboard);

    // Persist validation result regardless of pass/fail (fire-and-forget)
    this.qualityGates
      .savePreRenderValidation(job.data.projectId, validation)
      .catch((err) => logger.warn({ err }, "Failed to persist pre-render validation"));

    if (!validation.passed) {
      const summary = validation.errors.map((e) => e.message).join("; ");
      throw new Error(`Pre-render validation failed: ${summary}`);
    }

    // Jitter (per task rule #2)
    await this.sleep(Math.random() * 500);

    // Enforce 30-min timeout (task spec) — BullMQ 5 removed job-level timeout option
    const RENDER_TIMEOUT_MS = 1_800_000;
    const timeoutError = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Render timeout (30 min)")), RENDER_TIMEOUT_MS)
    );
    const renderedS3Url = await Promise.race([this.dispatchRender(job.data), timeoutError]);

    await job.updateProgress(100);

    // ── Post-render quality analysis (FEATURE-07) — non-blocking ──────────
    this.qualityGates
      .analyzeAndSave(job.data.projectId, renderedS3Url)
      .catch((err) =>
        logger.warn({ err, projectId: job.data.projectId }, "Post-render quality analysis failed (non-blocking)")
      );
  }

  protected async dispatchRender(payload: RenderPayload): Promise<string> {
    return this.renderService.render(payload.storyboard, payload.projectId);
  }

  // ── Lifecycle handlers ────────────────────────────────────────────────────

  private async onActive(job: Job<RenderPayload>) {
    await this.jobSync.syncActive(job.data.jobId);
  }

  private async onCompleted(job: Job<RenderPayload>) {
    await this.jobSync.syncCompleted(job.data.jobId);
    this.gateway.broadcastJobProgress(job.data.projectId, {
      jobId: job.data.jobId,
      step: job.data.step,
      status: "completed",
    });
  }

  private async onFailed(job: Job<RenderPayload> | undefined, err: Error) {
    if (!job) return;
    await this.jobSync.syncFailed(job.data.jobId, err);
    this.gateway.broadcastJobProgress(job.data.projectId, {
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

  private async onStalled(jobId: string) {
    logger.warn({ jobId, queue: QUEUE_NAME }, "Render job stalled — will be re-queued");
    await this.jobSync.syncStalled(jobId);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
