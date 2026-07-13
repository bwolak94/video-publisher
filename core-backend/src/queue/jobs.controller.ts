import { Controller, Get, Delete, Param, Query, NotFoundException, HttpCode, HttpStatus } from "@nestjs/common";
import { JobSyncService } from "./job-sync.service";
import { QueueService, type QueueName } from "./queue.service";

/**
 * HTTP polling endpoint for BullMQ job status.
 * GET /api/jobs/:id  — returns the job record from the `jobs` table.
 *
 * Useful for clients that can't use WebSocket (CI scripts, mobile apps).
 */
@Controller("api/jobs")
export class JobsController {
  constructor(
    private readonly jobSync: JobSyncService,
    private readonly queueService: QueueService,
  ) {}

  @Get(":id")
  async getStatus(@Param("id") id: string) {
    const job = await this.jobSync.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  /**
   * I1: Cancel a waiting/delayed BullMQ job.
   *
   * DELETE /api/jobs/:bullJobId?queue=asset-generation
   * `id` here is the BullMQ job ID (numeric string from BullMQ), not the DB job UUID.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param("id") id: string,
    @Query("queue") queue: string,
  ): Promise<void> {
    if (!queue) throw new NotFoundException("?queue= parameter is required");
    await this.queueService.cancel(queue as QueueName, id);
  }
}
