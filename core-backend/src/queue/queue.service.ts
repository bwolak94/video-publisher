import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
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
}
