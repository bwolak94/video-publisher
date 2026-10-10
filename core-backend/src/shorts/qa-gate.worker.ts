import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Queue, Job } from "bullmq";
import type Redis from "ioredis";
import pino from "pino";
import { REDIS_CLIENT } from "../redis/redis.module";
import { QaGateService } from "./qa-gate.service";

const logger = pino({ level: "info" });

const QUEUE_NAME = "qa-gate";

/** Maximum number of QA re-attempts before giving up on a clip. */
const MAX_QA_ATTEMPTS = 3;

export interface QaGateJobData {
  jobId: string;
  sceneId: string;
  clipS3Url: string;
  characterRefUrls?: string[];
  imagePrompt: string;
  motionPrompt: string;
  attempt: number;
}

@Injectable()
export class QaGateWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;
  private qaQueue: Queue | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly qaGateService: QaGateService,
  ) {}

  onModuleInit(): void {
    this.qaQueue = new Queue(QUEUE_NAME, {
      connection: this.redis as any,
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<QaGateJobData>) => this.process(job),
      {
        connection: this.redis as any,
        concurrency: 5,
      },
    );

    this.worker.on("completed", (job) => {
      logger.info({ jobId: job.id, data: job.data }, "QaGateWorker: job completed");
    });

    this.worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, err }, "QaGateWorker: job failed");
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      const graceful = this.worker.close(false);
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
      await Promise.race([graceful, timeout]);
    }
    if (this.qaQueue) {
      await this.qaQueue.close();
    }
  }

  // ── Job processor ────────────────────────────────────────────────────────────

  /**
   * Evaluates a clip via QaGateService. If evaluation fails and the attempt
   * count is below MAX_QA_ATTEMPTS the job is re-enqueued with an incremented
   * attempt counter so a fresh clip can be generated and re-scored.
   */
  async process(job: Job<QaGateJobData>): Promise<void> {
    const { jobId, sceneId, clipS3Url, characterRefUrls, imagePrompt, motionPrompt, attempt } =
      job.data;

    logger.info(
      { bullJobId: job.id, jobId, sceneId, attempt },
      "QaGateWorker: evaluating clip",
    );

    const result = await this.qaGateService.evaluate({
      jobId,
      sceneId,
      clipS3Url,
      characterRefUrls,
      imagePrompt,
      motionPrompt,
      attempt,
    });

    if (!result.passed && attempt < MAX_QA_ATTEMPTS) {
      logger.warn(
        { jobId, sceneId, score: result.score, attempt, nextAttempt: attempt + 1 },
        "QaGateWorker: clip failed QA — re-enqueueing for next attempt",
      );

      await this.qaQueue!.add("evaluate", {
        ...job.data,
        attempt: attempt + 1,
      });
    } else if (!result.passed) {
      logger.error(
        { jobId, sceneId, score: result.score, attempt },
        "QaGateWorker: clip failed QA after max attempts — marking as permanently failed",
      );
    }
  }
}
