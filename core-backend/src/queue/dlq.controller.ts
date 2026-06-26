import { Controller, Get, Param, Post, Body, NotFoundException } from "@nestjs/common";
import { DlqService } from "./dlq.service";
import { QueueService } from "./queue.service";

@Controller("api/dlq")
export class DlqController {
  constructor(
    private readonly dlq: DlqService,
    private readonly queues: QueueService
  ) {}

  @Get()
  async list() {
    return this.dlq.listJobs();
  }

  @Post(":id/retry")
  async retry(@Param("id") id: string, @Body() body: { sourceQueue?: string }) {
    const jobs = await this.dlq.listJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job) {
      throw new NotFoundException(`DLQ job ${id} not found`);
    }

    const sourceQueue = (body.sourceQueue ?? job.sourceQueue) as any;

    // Re-add to source queue with fresh attempt counter
    await this.queues.add(sourceQueue, {
      ...job.jobData,
      _retriedFromDlq: true,
    });

    // Remove from DLQ
    await this.dlq.retryJob(id, sourceQueue, job.jobData);

    return { queued: true, sourceQueue };
  }
}
