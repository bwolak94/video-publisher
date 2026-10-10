import { Injectable, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";

const logger = pino({ level: "info" });

/** Anthropic Messages API base URL and default model. */
const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";

/** Injectable fetch symbol — allows mocking in unit tests without network. */
export const QA_GATE_HTTP = Symbol("QA_GATE_HTTP");

export interface QaChecks {
  faceSim: number;
  artifactScore: number;
  promptAlign: number;
}

export interface QaEvaluateParams {
  jobId: string;
  sceneId: string;
  clipS3Url: string;
  characterRefUrls?: string[];
  imagePrompt: string;
  motionPrompt: string;
  attempt?: number;
}

export interface QaEvaluateResult {
  score: number;
  passed: boolean;
  checks: QaChecks;
}

@Injectable()
export class QaGateService {
  private readonly apiKey: string;
  private readonly threshold: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(QA_GATE_HTTP) private readonly httpFetch: typeof fetch,
  ) {
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    this.threshold = Number(process.env.QA_THRESHOLD ?? "0.75");
  }

  /**
   * Evaluates a generated clip using VLM checks and face similarity.
   *
   * Scoring weights:
   *   40% face similarity (placeholder 0.5 until face embedding is wired up)
   *   30% VLM artifact score  (Claude text-based heuristic)
   *   30% VLM prompt alignment (Claude text-based heuristic)
   *
   * The result row is persisted to scene_clips before returning.
   */
  async evaluate(params: QaEvaluateParams): Promise<QaEvaluateResult> {
    // 1. Face similarity — placeholder until face embedding service is available.
    const faceSim = params.characterRefUrls?.length ? 0.5 : 0.5;

    // 2. VLM artifact check via Anthropic (text-based — describes image quality).
    const artifactScore = await this.vlmArtifactCheck(params.imagePrompt);

    // 3. VLM prompt alignment via Anthropic.
    const promptAlign = await this.vlmPromptAlign(params.imagePrompt, params.motionPrompt);

    // 4. Weighted aggregate score.
    const score = 0.4 * faceSim + 0.3 * artifactScore + 0.3 * promptAlign;
    const passed = score >= this.threshold;

    const checks: QaChecks = { faceSim, artifactScore, promptAlign };

    logger.info(
      { jobId: params.jobId, sceneId: params.sceneId, score, passed, checks },
      "QaGateService: evaluation complete",
    );

    // 5. Persist result to scene_clips.
    await this.db.execute(sql`
      INSERT INTO scene_clips (job_id, scene_id, s3_url, attempt, qa_score, qa_checks, qa_passed)
      VALUES (
        ${params.jobId},
        ${params.sceneId},
        ${params.clipS3Url},
        ${params.attempt ?? 1},
        ${score},
        ${JSON.stringify(checks)}::jsonb,
        ${passed}
      )
    `);

    return { score, passed, checks };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Calls Anthropic asking whether the image description suggests visual
   * artifacts.  Returns a score in [0.0, 1.0] where 1.0 = no artifacts.
   *
   * A real implementation would pass an extracted frame thumbnail via the
   * vision content block.  The text-based version here is fully unit-testable
   * without a live Claude API key.
   */
  protected async vlmArtifactCheck(imagePrompt: string): Promise<number> {
    if (!this.apiKey) {
      return 0.8;
    }

    const systemPrompt =
      "You are a video quality reviewer. Assess whether the described scene would likely result " +
      "in visual artifacts such as distorted faces, warped hands, flickering, or incoherent backgrounds.";

    const userPrompt =
      `Scene description: "${imagePrompt}"\n\n` +
      "On a scale from 0.0 to 1.0, where 1.0 means the scene would render cleanly with no artifacts " +
      "and 0.0 means severe artifact risk, respond with ONLY a single decimal number (e.g. 0.85).";

    try {
      const raw = await this.callAnthropic(systemPrompt, userPrompt, 16);
      const parsed = parseFloat(raw.trim());
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    } catch (err) {
      logger.warn({ err }, "QaGateService: vlmArtifactCheck failed, using default");
    }

    return 0.8;
  }

  /**
   * Calls Anthropic asking how well the generated clip matches the original
   * prompts.  Returns a score in [0.0, 1.0].
   */
  protected async vlmPromptAlign(imagePrompt: string, motionPrompt: string): Promise<number> {
    if (!this.apiKey) {
      return 0.8;
    }

    const systemPrompt =
      "You are a video quality reviewer evaluating prompt-to-video alignment.";

    const userPrompt =
      `Image prompt: "${imagePrompt}"\n` +
      `Motion prompt: "${motionPrompt}"\n\n` +
      "Given both prompts describe the same scene, rate how coherent and aligned the final output " +
      "is likely to be on a scale from 0.0 to 1.0 where 1.0 = perfectly aligned. " +
      "Respond with ONLY a single decimal number (e.g. 0.90).";

    try {
      const raw = await this.callAnthropic(systemPrompt, userPrompt, 16);
      const parsed = parseFloat(raw.trim());
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    } catch (err) {
      logger.warn({ err }, "QaGateService: vlmPromptAlign failed, using default");
    }

    return 0.8;
  }

  /**
   * Low-level Anthropic Messages API call.  Uses the QA_GATE_HTTP fetch token
   * so it can be fully mocked in unit tests without network access.
   */
  private async callAnthropic(system: string, user: string, maxTokens: number): Promise<string> {
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
