/**
 * BudgetApprovalGate (FEATURE-09).
 *
 * Estimates per-action cost and optionally suspends execution until the user
 * approves or rejects the action via the frontend modal.
 *
 * Flow:
 *  1. ScenesController calls estimateAction() to get cost + provider.
 *  2. If cost > threshold → controller calls createPendingApproval(jobId) which
 *     returns a Promise that resolves/rejects when the user decides.
 *  3. ScenesController emits WS event "approval_required" (via EventsGateway).
 *  4. Frontend modal calls POST /api/budget/approval/:jobId/approve|reject.
 *  5. ScenesController calls approveJob() or rejectJob() to settle the Promise.
 */
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import pino from "pino";
import { CostConfigService } from "./cost-config.service";

const logger = pino({ level: "info" });

/** Default: prompt for approval when action costs more than $0.50 */
const DEFAULT_THRESHOLD_USD = 0.5;
/** Default timeout waiting for user response: 120 seconds */
const APPROVAL_TIMEOUT_MS = 120_000;

export type ActionType = "regenerate_visual" | "update_voice" | "render";

export interface ActionEstimate {
  estimatedCost: number;
  provider: string;
  /** True if this action exceeds the configured threshold and needs approval. */
  requiresApproval: boolean;
}

interface PendingApproval {
  resolve: () => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class BudgetApprovalGate {
  private readonly pending = new Map<string, PendingApproval>();

  constructor(private readonly costConfig: CostConfigService) {}

  // ── Cost estimation ────────────────────────────────────────────────────────

  /**
   * Estimate cost for a single action and determine whether approval is needed.
   *
   * @param action  Action type
   * @param params  Action-specific context (narrationText length, provider)
   */
  estimateAction(
    action: ActionType,
    params: { narrationTextLength?: number; provider?: string; durationSeconds?: number },
  ): ActionEstimate {
    const config = this.costConfig.get();
    const threshold = this.getThreshold();
    let estimatedCost: number;
    let provider: string;

    switch (action) {
      case "regenerate_visual":
        // Default to Runway rate; caller may pass actual provider from registry
        provider = params.provider ?? "runway";
        estimatedCost =
          provider === "pexels" || provider === "archival" || provider === "piper"
            ? 0
            : provider === "kling"
            ? 0.1  // Kling is slightly cheaper than Runway
            : config.runwayPerSceneUsd;
        break;

      case "update_voice":
        provider = params.provider ?? "elevenlabs";
        estimatedCost =
          provider.startsWith("piper")
            ? 0
            : (params.narrationTextLength ?? 0) * config.elevenlabsPerCharUsd;
        break;

      case "render":
        provider = "lambda";
        estimatedCost = ((params.durationSeconds ?? 30) / 60) * config.lambdaRenderPerMinUsd;
        break;
    }

    return {
      estimatedCost,
      provider,
      requiresApproval: estimatedCost > threshold,
    };
  }

  /** Create a unique job ID for an approval request. */
  createJobId(): string {
    return randomUUID();
  }

  // ── Pending approval lifecycle ─────────────────────────────────────────────

  /**
   * Register a pending approval and return a Promise that resolves on user
   * approval or rejects on rejection / timeout.
   */
  createPendingApproval(jobId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(jobId);
        reject(new Error(`Approval timeout for job ${jobId} — no response within ${APPROVAL_TIMEOUT_MS / 1000}s`));
        logger.warn({ jobId }, "Approval timed out");
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(jobId, { resolve, reject, timer });
      logger.info({ jobId }, "Pending approval created");
    });
  }

  approveJob(jobId: string): boolean {
    const entry = this.pending.get(jobId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(jobId);
    entry.resolve();
    logger.info({ jobId }, "Approval granted");
    return true;
  }

  rejectJob(jobId: string): boolean {
    const entry = this.pending.get(jobId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(jobId);
    entry.reject(new Error("Action rejected by user"));
    logger.info({ jobId }, "Approval rejected");
    return true;
  }

  hasPending(jobId: string): boolean {
    return this.pending.has(jobId);
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  getThreshold(): number {
    const env = process.env.BUDGET_APPROVAL_THRESHOLD_USD;
    return env ? parseFloat(env) : DEFAULT_THRESHOLD_USD;
  }
}
