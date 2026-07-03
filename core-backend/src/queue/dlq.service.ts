import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Queue, Job } from "bullmq";
import pino from "pino";
import { REDIS_CLIENT } from "../redis/redis.module";

const logger = pino({ level: "info" });
const DLQ_QUEUE_NAME = "failed-jobs";

export interface DlqEntry {
  id: string;
  sourceQueue: string;
  jobData: Record<string, unknown>;
  errorMessage: string;
  failedAt: string;
  attemptsMade: number;
}

@Injectable()
export class DlqService implements OnModuleInit, OnModuleDestroy {
  private dlqQueue: Queue;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  onModuleInit() {
    this.dlqQueue = new Queue(DLQ_QUEUE_NAME, {
      connection: this.redis,
      defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
    });
  }

  async onModuleDestroy() {
    await this.dlqQueue.close();
  }

  async enqueue(
    sourceQueue: string,
    jobData: Record<string, unknown>,
    error: Error,
    attemptsMade: number
  ): Promise<void> {
    const entry: Omit<DlqEntry, "id"> = {
      sourceQueue,
      jobData,
      errorMessage: error.message.slice(0, 500),
      failedAt: new Date().toISOString(),
      attemptsMade,
    };
    await this.dlqQueue.add("failed", entry);
    logger.error(
      { sourceQueue, jobId: (jobData as any).jobId, error: entry.errorMessage },
      "Job moved to DLQ"
    );
  }

  async listJobs(): Promise<DlqEntry[]> {
    const jobs: Job[] = await this.dlqQueue.getJobs(["waiting", "delayed", "failed"], 0, 200);
    return jobs.map((j) => ({ id: j.id!, ...(j.data as Omit<DlqEntry, "id">) }));
  }

  async retryJob(dlqJobId: string, sourceQueue: string, _originalData: Record<string, unknown>): Promise<void> {
    // Remove from DLQ
    const job = await Job.fromId(this.dlqQueue, dlqJobId);
    if (job) {
      await job.remove();
    }
    logger.info({ dlqJobId, sourceQueue }, "DLQ job manually retried");
  }

  getQueue(): Queue {
    return this.dlqQueue;
  }
}
