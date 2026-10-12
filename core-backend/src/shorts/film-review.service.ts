import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { S3Service } from '../storage/s3.service';
import pino from 'pino';

const logger = pino({ level: 'info' });

@Injectable()
export class FilmReviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly s3Service: S3Service,
  ) {}

  async sendReview(jobId: string): Promise<{ token: string; jobId: string }> {
    // Return existing pending review if one already exists
    const existing = await this.db.execute(sql`
      SELECT token FROM film_reviews WHERE job_id = ${jobId} AND status = 'pending'
    `);
    const rows = Array.isArray(existing) ? existing : (existing as any).rows ?? [];
    if (rows[0]) {
      return { token: (rows[0] as any).token, jobId };
    }

    // Verify the job exists
    const jobs = await this.db.execute(sql`SELECT id FROM shorts_jobs WHERE id = ${jobId}`);
    const jobRows = Array.isArray(jobs) ? jobs : (jobs as any).rows ?? [];
    if (!jobRows[0]) throw new NotFoundException(`Job ${jobId} not found`);

    const finalKey = `shorts/${jobId}/final.mp4`;
    let videoUrl: string;
    try {
      videoUrl = await this.s3Service.getPresignedUrl(finalKey, 3600);
    } catch {
      videoUrl = '';
    }

    const result = await this.db.execute(sql`
      INSERT INTO film_reviews (job_id, video_url)
      VALUES (${jobId}, ${videoUrl})
      RETURNING token
    `);
    const inserted = Array.isArray(result) ? result : (result as any).rows ?? [];
    const token = (inserted[0] as any).token;

    logger.info({ jobId, token }, 'FilmReviewService: review created');
    return { token, jobId };
  }

  async findByToken(token: string) {
    const rows = await this.db.execute(sql`
      SELECT fr.id, fr.job_id, fr.token, fr.status, fr.video_url, fr.reviewed_at,
             sj.brief
      FROM film_reviews fr
      JOIN shorts_jobs sj ON sj.id = fr.job_id
      WHERE fr.token = ${token}
    `);
    const data = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    const row = data[0];
    if (!row) throw new NotFoundException(`Review token not found`);
    return row;
  }

  async approve(token: string): Promise<{ status: string }> {
    const rows = await this.db.execute(sql`
      UPDATE film_reviews
      SET status = 'approved', reviewed_at = now()
      WHERE token = ${token}
      RETURNING id
    `);
    const data = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    if (!data[0]) throw new NotFoundException(`Review token not found`);
    logger.info({ token }, 'FilmReviewService: review approved');
    return { status: 'approved' };
  }

  async reject(token: string): Promise<{ status: string }> {
    const rows = await this.db.execute(sql`
      UPDATE film_reviews
      SET status = 'rejected', reviewed_at = now()
      WHERE token = ${token}
      RETURNING id
    `);
    const data = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    if (!data[0]) throw new NotFoundException(`Review token not found`);
    logger.info({ token }, 'FilmReviewService: review rejected');
    return { status: 'rejected' };
  }

  async listReviews() {
    const rows = await this.db.execute(sql`
      SELECT fr.id, fr.job_id, fr.token, fr.status, fr.created_at,
             sj.brief
      FROM film_reviews fr
      JOIN shorts_jobs sj ON sj.id = fr.job_id
      ORDER BY fr.created_at DESC
      LIMIT 50
    `);
    return Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  }
}
