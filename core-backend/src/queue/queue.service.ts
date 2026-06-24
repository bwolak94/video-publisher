import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { REDIS_CLIENT } from "../redis/redis.module";

export type QueueName = "research" | "asset-generation" | "render";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queues: Map<QueueName, Queue> = new Map();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  onModuleInit() {
    const names: QueueName[] = ["research", "asset-generation", "render"];
    for (const name of names) {
      this.queues.set(
        name,
        new Queue(name, { connection: this.redis })
      );
    }
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  async add(queueName: QueueName, payload: Record<string, unknown>) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Unknown queue: ${queueName}`);
    }
    return queue.add(queueName, payload);
  }

  getQueue(name: QueueName): Queue | undefined {
    return this.queues.get(name);
  }
}
