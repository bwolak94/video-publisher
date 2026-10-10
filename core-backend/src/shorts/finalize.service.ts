import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pino from 'pino';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { S3Service } from '../storage/s3.service';
import { C2paService } from './c2pa.service';

const logger = pino({ level: 'info' });

export interface FinalizeResult {
  s3Url: string;
  c2paManifestId: string;
  aiLabel: string;
}

@Injectable()
export class FinalizeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly c2paService: C2paService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Finalizes a shorts job by building a C2PA manifest for accepted clips and
   * uploading it as a sidecar JSON to S3. In production, accepted clips would be
   * concatenated via FFmpeg before c2patool embeds the manifest into the MP4 container.
   *
   * @param jobId - UUID of the shorts_jobs row to finalize
   * @returns S3 URL of the final MP4 placeholder, manifest ID, and AI disclosure label
   */
  async finalizeJob(jobId: string): Promise<FinalizeResult> {
    // 1. Load job
    const jobs = await this.db.execute(sql`SELECT * FROM shorts_jobs WHERE id = ${jobId}`);
    const jobRows: any[] = Array.isArray(jobs) ? jobs : ((jobs as unknown) as any).rows ?? [];
    const job = jobRows[0];
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    // 2. Load accepted clips ordered by scene position
    const clips = await this.db.execute(sql`
      SELECT s3_url, scene_id, model FROM scene_clips
      WHERE job_id = ${jobId} AND qa_passed = true
      ORDER BY scene_id ASC
    `);
    const clipRows: any[] = Array.isArray(clips) ? clips : ((clips as unknown) as any).rows ?? [];

    logger.info({ jobId, acceptedClips: clipRows.length }, 'FinalizeService: building C2PA manifest');

    // 3. Build C2PA metadata from accepted clips
    const models = [
      ...new Set(clipRows.map((c: any) => c.model as string).filter(Boolean)),
    ] as string[];
    const timestamp = new Date().toISOString();
    const hasLikeness = Boolean((job.character_ids as any[])?.length);

    const { manifestId, manifestJson } = await this.c2paService.embedManifest({
      title: String(job.brief ?? 'AI Short').slice(0, 80),
      models: models.length ? models : ['wan-2.5'],
      generator: 'AI Video Factory',
      timestamp,
      hasLikeness,
    });

    // 4. Upload manifest sidecar JSON to S3
    const manifestKey = `shorts/${jobId}/c2pa-manifest.json`;
    const manifestBuffer = Buffer.from(manifestJson, 'utf-8');
    const manifestS3Url = await this.s3Service.uploadBuffer(
      manifestKey,
      manifestBuffer,
      'application/json',
    );

    logger.info({ jobId, manifestId, manifestS3Url }, 'FinalizeService: C2PA manifest uploaded');

    // 5. Build final MP4 S3 path
    // In production: FFmpeg concat accepted clips → c2patool embed manifest → upload MP4
    const bucket =
      process.env.AWS_BUCKET ??
      process.env.S3_BUCKET_NAME ??
      process.env.S3_BUCKET ??
      'video-publisher-assets';
    const finalKey = `shorts/${jobId}/final.mp4`;
    const s3Url = `s3://${bucket}/${finalKey}`;

    // 6. Mark job as done
    await this.db.execute(sql`
      UPDATE shorts_jobs SET status = 'done' WHERE id = ${jobId}
    `);

    logger.info({ jobId, s3Url }, 'FinalizeService: job marked as done');

    const aiLabel = hasLikeness
      ? 'Film zawiera syntetyczny wizerunek osoby rzeczywistej wygenerowany przez AI (deepfake, C2PA, AI Act art. 50).'
      : 'Film zawiera postacie fikcyjne wygenerowane przez AI (C2PA).';

    return { s3Url, c2paManifestId: manifestId, aiLabel };
  }
}
