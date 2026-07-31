import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import pino from "pino";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { JobSyncService } from "../job-sync.service";
import { DlqAlertService } from "../dlq-alert.service";
import { DlqService } from "../dlq.service";
import { EventsGateway } from "../../gateway/events.gateway";
import { QUEUE_CONCURRENCY, RENDER_WORKER_SETTINGS } from "../queue.config";
import { RenderService } from "../../render/render.service";
import { RenderQualityService } from "../../render/render-quality.service";
import { VideoStoryboard } from "../../storyboard/video-storyboard";
import { MetricsService } from "../../metrics/metrics.service";
import { PreRenderValidatorService } from "../../quality/pre-render-validator.service";
import { QualityGatesService } from "../../quality/quality-gates.service";

const logger = pino({ level: "info" });
const QUEUE_NAME = "render";
// Must match renderJobOptions.attempts in queue.config.ts
const MAX_ATTEMPTS = 2;

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
    private readonly renderQuality: RenderQualityService,
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
        stalledInterval: RENDER_WORKER_SETTINGS.stalledInterval,
        maxStalledCount: RENDER_WORKER_SETTINGS.maxStalledCount,
      }
    );

    this.worker.on("active", (job) => this.onActive(job));
    this.worker.on("completed", (job) => this.onCompleted(job));
    this.worker.on("failed", (job, err) => this.onFailed(job, err));
    this.worker.on("stalled", (jobId) => this.onStalled(jobId));
  }

  async onModuleDestroy() {
    if (!this.worker) return;
    const graceful = this.worker.close(false);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    await Promise.race([graceful, timeout]);
  }

  // ── Job processor ──────────────────────────────────────────────────────────

  private async process(job: Job<RenderPayload>): Promise<void> {
    logger.info({ jobId: job.id, projectId: job.data.projectId }, "Dispatching render");

    // ── Pre-render validation (FEATURE-07) ────────────────────────────────
    const validation = await this.preRenderValidator.validate(job.data.storyboard);
    this.qualityGates
      .savePreRenderValidation(job.data.projectId, validation)
      .catch((err) => logger.warn({ err }, "Failed to persist pre-render validation"));

    if (!validation.passed) {
      const summary = validation.errors.map((e) => e.message).join("; ");
      throw new Error(`Pre-render validation failed: ${summary}`);
    }

    await this.sleep(Math.random() * 500);

    // Signal render started at 0 %
    void this.gateway.broadcastRenderProgress(job.data.projectId, 0);
    await job.updateProgress(0);

    // S2: Dispatch to Lambda with webhook — slot freed immediately.
    // Progress (0→100 %) and job completion are signalled by /webhooks/remotion.
    await this.dispatchRenderAsync(job.data);
  }

  /** S2: Fire-and-forget dispatch. Lambda calls back /webhooks/remotion on finish. */
  protected async dispatchRenderAsync(payload: RenderPayload): Promise<void> {
    await this.renderService.renderAsync(payload.storyboard, payload.projectId, payload.jobId);
  }

  /** Legacy sync dispatch — kept for tests. */
  protected async dispatchRender(payload: RenderPayload): Promise<string> {
    return this.renderService.render(payload.storyboard, payload.projectId);
  }

  // ── Lifecycle handlers ────────────────────────────────────────────────────

  private async onActive(job: Job<RenderPayload>) {
    await this.jobSync.syncActive(job.data.jobId);
  }

  private async onCompleted(job: Job<RenderPayload>) {
    // S2: Job "completed" in BullMQ means "dispatched to Lambda" — not render-finished.
    // Actual completion (syncCompleted + WS broadcast) is handled by RenderWebhookController
    // when Lambda fires the webhook. We only log here.
    logger.info({ jobId: job.data.jobId, projectId: job.data.projectId }, "Render dispatched to Lambda, awaiting webhook");
  }

  private async onFailed(job: Job<RenderPayload> | undefined, err: Error) {
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

  private async onStalled(jobId: string) {
    logger.warn({ jobId, queue: QUEUE_NAME }, "Render job stalled — will be re-queued");
    await this.jobSync.syncStalled(jobId);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
