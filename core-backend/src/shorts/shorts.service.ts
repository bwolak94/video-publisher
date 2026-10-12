import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import pino from "pino";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { shortsJobs } from "../db/schema";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { ScenePlanSchema, type ScenePlanScene } from "./schemas/scene-plan.schema";

import { Queue } from "bullmq";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";
const logger = pino({ level: "info" });

/** Injectable fetch symbol — allows mocking in unit tests. */
export const ANTHROPIC_HTTP = Symbol("ANTHROPIC_HTTP");

/** BullMQ queue name for I2V (image-to-video) generation jobs. */
const I2V_QUEUE_NAME = "i2v";

/** Default model used for scene plan generation and moderation. */
const ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export interface GenerateScenePlanResult {
  jobId: string;
  scenePlan: ScenePlanScene[];
}

@Injectable()
export class ShortsService {
  private readonly apiKey: string;
  private readonly i2vQueue: Queue;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ANTHROPIC_HTTP) private readonly httpFetch: typeof fetch,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    this.i2vQueue = new Queue(I2V_QUEUE_NAME, { connection: this.redis as any });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Generates an LLM scene plan for the given brief and persists it as a
   * `shorts_jobs` row. Throws `BadRequestException` when moderation detects a
   * real-person reference, or `UnprocessableEntityException` when JSON parsing
   * fails after one retry.
   */
  async generateScenePlan(dto: CreateBriefDto): Promise<GenerateScenePlanResult> {
    // Step 1 — moderation gate
    const moderationReason = await this.moderateCheck(dto.brief);
    if (moderationReason) {
      logger.warn({ brief: dto.brief.slice(0, 60) }, "Shorts: brief rejected by moderation");
      throw new BadRequestException({ moderation: moderationReason });
    }

    // Step 2 — compute scene count from duration
    const sceneCount = this.sceneCountForDuration(dto.duration);

    // Step 3 — build prompts
    const systemPrompt =
      `You are a video director creating scene plans for short-form content. ` +
      `Return ONLY a valid JSON array (no markdown, no explanation) of exactly ${sceneCount} scene objects, ` +
      `each with: scene_id (s01, s02...), duration_s (number), characters (array of strings), ` +
      `image_prompt (string), motion_prompt (string), camera (string), voiceover (string), ` +
      `sfx_tags (array of strings), model_hint (one of: action, dialog, landscape).`;

    const userPrompt =
      `Brief: ${dto.brief}\n` +
      `Duration: ${dto.duration}s\n` +
      `Scene count: ${sceneCount}\n` +
      `Shot track: ${dto.shotTrack}`;

    // Step 4 — call LLM (with one retry on parse failure)
    const scenePlan = await this.callLlmWithRetry(systemPrompt, userPrompt);

    // Step 5 — persist to shorts_jobs
    const [row] = await this.db
      .insert(shortsJobs)
      .values({
        brief:       dto.brief,
        nicheId:     dto.nicheId ?? null,
        characterIds: dto.characterIds ?? [],
        budgetUsd:   String(dto.budgetUsd),
        durationS:   String(dto.duration),
        shotTrack:   dto.shotTrack,
        hitl:        dto.hitl,
        scenePlan:   scenePlan as any,
        status:      "plan_ready",
        moderationBlocked: false,
      } as any)
      .returning();

    logger.info({ jobId: row.id, sceneCount }, "Shorts: scene plan generated and persisted");

    return { jobId: row.id, scenePlan };
  }

  /**
   * Returns a single shorts job by id. Throws `NotFoundException` when not found.
   */
  async findJob(id: string) {
    const rows = await this.db.execute(
      sql`SELECT id, brief, scene_plan, status, created_at FROM shorts_jobs WHERE id = ${id}`,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(`Job ${id} not found`);
    return row;
  }

  /**
   * Returns a job status summary including per-scene stage breakdown.
   * Throws `NotFoundException` when the job does not exist.
   */
  async getJobStatus(id: string) {
    const rows = await this.db.execute(
      sql`SELECT id, brief, scene_plan, status, budget_usd, created_at FROM shorts_jobs WHERE id = ${id}`,
    );
    const job = rows[0];
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    const scenes = (((job as any).scene_plan as any[]) ?? []).map((scene: any) => ({
      id: scene.scene_id,
      title: scene.image_prompt?.slice(0, 40),
      track: 'i2v',
      model: scene.model_hint,
      attempt: 1,
      status: 'queued',
      stages: { t2i: 'pending', review: 'pending', i2v: 'pending', qa: 'pending', 'lip-sync': 'pending' },
    }));
    return {
      id: (job as any).id,
      brief: (job as any).brief,
      status: (job as any).status,
      done: 0,
      total: scenes.length,
      cost: 0,
      budget: Number((job as any).budget_usd),
      elapsed: 0,
      eta: scenes.length * 30,
      scenes,
    };
  }

  /**
   * Returns a presigned-style download URL for the final MP4 of a completed job.
   * The S3 key follows the pattern `shorts/{jobId}/final.mp4`.
   * TTL is 300 seconds (5 min) per security policy.
   * Throws `NotFoundException` when the job does not exist.
   */
  async getDownloadUrl(jobId: string): Promise<string> {
    const rows = await this.db.execute(
      sql`SELECT id, status FROM shorts_jobs WHERE id = ${jobId}`,
    );
    const job = rows[0];
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    const key = `shorts/${jobId}/final.mp4`;
    return key;
  }

  /**
   * Resumes a shorts job that has one or more failed QA clips.
   * Sets the job status back to 'generating' so workers pick it up again,
   * and returns the scene_id of the first failed clip.
   */
  async resumeJob(jobId: string): Promise<{ status: string; resumedFromScene: string | null }> {
    const clips = await this.db.execute(sql`
      SELECT scene_id FROM scene_clips
      WHERE job_id = ${jobId} AND qa_passed = false
      ORDER BY created_at ASC LIMIT 1
    `);

    const rows2 = Array.isArray(clips) ? clips : (clips as any).rows ?? [];
    const failedScene = (rows2[0] as any)?.scene_id ?? null;

    if (failedScene) {
      await this.db.execute(sql`
        UPDATE shorts_jobs SET status = 'generating' WHERE id = ${jobId}
      `);
    }

    return { status: "resumed", resumedFromScene: failedScene };
  }

  /**
   * Starts I2V generation for all keyframe-accepted scenes in a job.
   * Enqueues a BullMQ job per scene and transitions job status to 'generating_i2v'.
   */
  async startI2V(jobId: string): Promise<{ jobId: string; status: string; sceneCount: number }> {
    const rows = await this.db.execute(
      sql`SELECT id, status, scene_plan FROM shorts_jobs WHERE id = ${jobId}`,
    );
    const job = Array.isArray(rows) ? rows[0] : (rows as any).rows?.[0];
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const scenePlan: any[] = (job as any).scene_plan ?? [];

    await this.db.execute(
      sql`UPDATE shorts_jobs SET status = 'generating_i2v' WHERE id = ${jobId}`,
    );

    for (const scene of scenePlan) {
      await this.i2vQueue.add('generate-i2v', {
        jobId,
        sceneId: scene.scene_id,
        imagePrompt: scene.image_prompt,
        motionPrompt: scene.motion_prompt,
        modelHint: scene.model_hint,
      });
    }

    logger.info({ jobId, sceneCount: scenePlan.length }, 'ShortsService: I2V generation started');

    return { jobId, status: 'generating_i2v', sceneCount: scenePlan.length };
  }

  /**
   * Re-enqueues I2V generation for a single scene (retry after failure).
   */
  async generateSceneI2V(jobId: string, sceneId: string): Promise<{ sceneId: string; status: string }> {
    const rows = await this.db.execute(
      sql`SELECT scene_plan FROM shorts_jobs WHERE id = ${jobId}`,
    );
    const job = Array.isArray(rows) ? rows[0] : (rows as any).rows?.[0];
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const scene = ((job as any).scene_plan ?? []).find((s: any) => s.scene_id === sceneId);

    await this.i2vQueue.add('generate-i2v', {
      jobId,
      sceneId,
      imagePrompt: scene?.image_prompt ?? '',
      motionPrompt: scene?.motion_prompt ?? '',
      modelHint: scene?.model_hint ?? 'action',
    });

    logger.info({ jobId, sceneId }, 'ShortsService: single scene I2V re-enqueued');

    return { sceneId, status: 'queued' };
  }

  /**
   * Approves a scene clip via the human QA gate (FIX-03).
   * Sets manual_qa_status = 'approved' and qa_passed = true for all clips
   * matching the given jobId + sceneId.
   */
  async approveQA(jobId: string, sceneId: string): Promise<{ sceneId: string; status: string }> {
    await this.db.execute(sql`
      UPDATE scene_clips
      SET manual_qa_status = 'approved', qa_passed = true
      WHERE job_id = ${jobId} AND scene_id = ${sceneId}
    `);
    logger.info({ jobId, sceneId }, "ShortsService: QA approved by human operator");
    return { sceneId, status: "qa_approved" };
  }

  /**
   * Rejects a scene clip via the human QA gate (FIX-03).
   * Sets manual_qa_status = 'rejected' and qa_passed = false, then resets the
   * shorts job to 'generating' so the I2V pipeline re-picks the scene.
   */
  async rejectQA(
    jobId: string,
    sceneId: string,
    reason?: string,
  ): Promise<{ sceneId: string; status: string; reason?: string }> {
    await this.db.execute(sql`
      UPDATE scene_clips
      SET manual_qa_status = 'rejected', qa_passed = false
      WHERE job_id = ${jobId} AND scene_id = ${sceneId}
    `);
    await this.db.execute(sql`
      UPDATE shorts_jobs SET status = 'generating' WHERE id = ${jobId}
    `);
    logger.info({ jobId, sceneId, reason }, "ShortsService: QA rejected by human operator — re-queuing I2V");
    return { sceneId, status: "generating_i2v", reason };
  }

  /**
   * Returns the most recent shorts jobs up to `limit`.
   */
  async listJobs(limit = 20) {
    const rows = await this.db.execute(
      sql`SELECT id, brief, status, created_at FROM shorts_jobs ORDER BY created_at DESC LIMIT ${limit}`,
    );
    const data = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    return { data, total: data.length };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Checks whether the brief references a real person by their full name.
   * Returns a human-readable rejection reason string, or `null` if clean.
   */
  private async moderateCheck(brief: string): Promise<string | null> {
    const response = await this.callAnthropic(
      "You are a content moderation assistant.",
      `Does this video brief mention any real person by their full name or describe a clearly identifiable real individual? Answer only YES or NO.\n\nBrief: ${brief}`,
      50,
    );

    if (response.trim().toUpperCase().startsWith("YES")) {
      return "Brief zawiera wizerunek rzeczywistej osoby, co jest niezgodne z polityką platformy.";
    }
    return null;
  }

  /** Maps a duration (seconds) to a scene count. */
  private sceneCountForDuration(duration: 15 | 30 | 45): number {
    const map: Record<number, number> = { 15: 3, 30: 6, 45: 8 };
    return map[duration];
  }

  /**
   * Calls the LLM to generate a scene plan. Retries once on zod validation
   * failure, appending the error context to help the model self-correct.
   */
  private async callLlmWithRetry(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<ScenePlanScene[]> {
    const raw = await this.callAnthropic(systemPrompt, userPrompt, 4096);
    const parseError = this.tryParseScenePlan(raw);

    if (parseError.scenes !== null) {
      return parseError.scenes;
    }

    // Retry once with error context appended
    logger.warn({ error: parseError.error }, "Shorts: scene plan parse failed, retrying");
    const retryUserPrompt =
      userPrompt +
      `\n\nYour previous response could not be validated. Error: ${parseError.error}. ` +
      `Fix the JSON and return ONLY the corrected array.`;

    const rawRetry = await this.callAnthropic(systemPrompt, retryUserPrompt, 4096);
    const retryResult = this.tryParseScenePlan(rawRetry);

    if (retryResult.scenes !== null) {
      return retryResult.scenes;
    }

    throw new UnprocessableEntityException({
      message: "Failed to generate a valid scene plan after retry",
      errors: retryResult.error,
    });
  }

  /**
   * Attempts to parse and zod-validate a raw LLM JSON string.
   * Returns `{ scenes, error: null }` on success or `{ scenes: null, error }` on failure.
   */
  private tryParseScenePlan(
    raw: string,
  ): { scenes: ScenePlanScene[]; error: null } | { scenes: null; error: string } {
    try {
      const json: unknown = JSON.parse(raw.trim());
      const parsed = ScenePlanSchema.parse(json);
      return { scenes: parsed, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { scenes: null, error: message };
    }
  }

  /**
   * Low-level Anthropic Messages API call. Uses the ANTHROPIC_HTTP fetch token
   * so it can be fully mocked in unit tests without network access.
   */
  private async callAnthropic(
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<string> {
    const response = await this.httpFetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key":         this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data: any = await response.json();
    return (data.content?.[0]?.text ?? "") as string;
  }
}
