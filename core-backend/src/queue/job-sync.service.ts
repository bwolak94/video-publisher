import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { jobs, type Job } from "../db/schema";

export interface JobProgressPayload {
  jobId: string;
  step: string;
  status: string;
  sceneId?: string;
  projectId?: string;
}

/**
 * Persists BullMQ lifecycle events to the PostgreSQL `jobs` table.
 * Called by workers on every state transition (active → completed/failed).
 */
@Injectable()
export class JobSyncService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async syncActive(jobId: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  async syncCompleted(jobId: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  async syncFailed(jobId: string, error: Error): Promise<void> {
    await this.db
      .update(jobs)
      .set({
        status: "failed",
        error: error.message,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  }

  async syncStalled(jobId: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: "stalled", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  /** Retrieve a single job record by ID. Returns null when not found. */
  async findById(jobId: string): Promise<Job | null> {
    const rows = await this.db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    return rows[0] ?? null;
  }
}
