import { Injectable, Inject, OnModuleInit, OnModuleDestroy, NotFoundException } from "@nestjs/common";
import { Queue, Job } from "bullmq";
import { REDIS_CLIENT } from "../redis/redis.module";
import { QUEUE_OPTIONS } from "./queue.config";

export type QueueName = "research" | "asset-generation" | "render" | "localization" | "publish" | "webhook";

const QUEUE_NAMES: QueueName[] = ["research", "asset-generation", "render", "localization", "publish", "webhook"];

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queues: Map<QueueName, Queue> = new Map();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  onModuleInit() {
    for (const name of QUEUE_NAMES) {
      this.queues.set(
        name,
        new Queue(name, {
          connection: this.redis,
          ...QUEUE_OPTIONS[name],
        })
      );
    }
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  async add(
    queueName: QueueName,
    payload: Record<string, unknown>,
    options?: { delay?: number; priority?: number },
  ) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Unknown queue: ${queueName}`);
    }
    // Note: render jobs have a 30-min max runtime per task spec; BullMQ 5 removed the
    // `timeout` job option — enforce in the render worker process via a Promise.race() with a timer.
    const jobOptions: Record<string, unknown> = {};
    if (options?.delay !== undefined) jobOptions.delay = options.delay;
    if (options?.priority !== undefined) jobOptions.priority = options.priority;
    if (Object.keys(jobOptions).length) {
      return queue.add(queueName, payload, jobOptions);
    }
    return queue.add(queueName, payload);
  }

  getQueue(name: QueueName): Queue | undefined {
    return this.queues.get(name);
  }

  getAllQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  /**
   * I1: Cancel a waiting or delayed job by BullMQ job ID.
   * Throws NotFoundException if the job doesn't exist or is already active/completed.
   */
  async cancel(queueName: QueueName, bullJobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new NotFoundException(`Unknown queue: ${queueName}`);

    const job = await Job.fromId(queue, bullJobId);
    if (!job) throw new NotFoundException(`Job ${bullJobId} not found in queue ${queueName}`);

    const state = await job.getState();
    if (state === "active") {
      throw new Error(`Job ${bullJobId} is currently active and cannot be cancelled`);
    }

    await job.remove();
  }
}
