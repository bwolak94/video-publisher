import { Controller, Get, Param, NotFoundException } from "@nestjs/common";
import { JobSyncService } from "./job-sync.service";

/**
 * HTTP polling endpoint for BullMQ job status.
 * GET /api/jobs/:id  — returns the job record from the `jobs` table.
 *
 * Useful for clients that can't use WebSocket (CI scripts, mobile apps).
 */
@Controller("api/jobs")
export class JobsController {
  constructor(private readonly jobSync: JobSyncService) {}

  @Get(":id")
  async getStatus(@Param("id") id: string) {
    const job = await this.jobSync.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }
}
