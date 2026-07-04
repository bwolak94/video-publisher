/**
 * Unit tests for BudgetApprovalGate (FEATURE-09) — UT-09-01..06
 */
import { BudgetApprovalGate } from "./budget-approval-gate";
import { CostConfigService } from "./cost-config.service";

function makeGate(): BudgetApprovalGate {
  const config = new CostConfigService();
  return new BudgetApprovalGate(config);
}

// ── UT-09-01: Cost estimates ─────────────────────────────────────────────────

describe("BudgetApprovalGate.estimateAction()", () => {
  it("UT-09-01a: regenerate_visual → default runway rate", () => {
    const gate = makeGate();
    const { estimatedCost, provider } = gate.estimateAction("regenerate_visual", {});
    expect(provider).toBe("runway");
    expect(estimatedCost).toBeCloseTo(0.15);
  });

  it("UT-09-01b: regenerate_visual with pexels → 0", () => {
    const gate = makeGate();
    const { estimatedCost } = gate.estimateAction("regenerate_visual", { provider: "pexels" });
    expect(estimatedCost).toBe(0);
  });

  it("UT-09-01c: update_voice ElevenLabs → length × 0.0003", () => {
    const gate = makeGate();
    const text = "A".repeat(500);
    const { estimatedCost } = gate.estimateAction("update_voice", {
      narrationTextLength: text.length,
      provider: "21m00Tcm4TlvDq8ikWAM",
    });
    expect(estimatedCost).toBeCloseTo(500 * 0.0003);
  });

  it("UT-09-01d: update_voice piper → 0 (free)", () => {
    const gate = makeGate();
    const { estimatedCost } = gate.estimateAction("update_voice", {
      narrationTextLength: 500,
      provider: "piper_en_us_lessac_medium",
    });
    expect(estimatedCost).toBe(0);
  });
});

// ── UT-09-02: requiresApproval flag ─────────────────────────────────────────

describe("BudgetApprovalGate requiresApproval", () => {
  it("UT-09-02a: cost below default threshold ($0.50) → false", () => {
    const gate = makeGate();
    const { requiresApproval } = gate.estimateAction("regenerate_visual", { provider: "pexels" });
    expect(requiresApproval).toBe(false);
  });

  it("UT-09-02b: runway $0.15 below default $0.50 threshold → false", () => {
    const gate = makeGate();
    const { requiresApproval } = gate.estimateAction("regenerate_visual", {});
    expect(requiresApproval).toBe(false);
  });

  it("UT-09-02c: ElevenLabs with 2000 chars → $0.60 → requiresApproval true", () => {
    const gate = makeGate();
    const { requiresApproval, estimatedCost } = gate.estimateAction("update_voice", {
      narrationTextLength: 2000,
      provider: "21m00Tcm4TlvDq8ikWAM",
    });
    expect(estimatedCost).toBeCloseTo(0.6);
    expect(requiresApproval).toBe(true);
  });
});

// ── UT-09-03: Pending approval lifecycle ─────────────────────────────────────

describe("BudgetApprovalGate pending approval", () => {
  it("UT-09-03a: approveJob resolves the pending promise", async () => {
    const gate = makeGate();
    const jobId = gate.createJobId();
    const pendingPromise = gate.createPendingApproval(jobId);

    gate.approveJob(jobId);
    await expect(pendingPromise).resolves.toBeUndefined();
  });

  it("UT-09-03b: rejectJob rejects the pending promise", async () => {
    const gate = makeGate();
    const jobId = gate.createJobId();
    const pendingPromise = gate.createPendingApproval(jobId);

    gate.rejectJob(jobId);
    await expect(pendingPromise).rejects.toThrow("rejected by user");
  });

  it("UT-09-03c: approveJob returns false for unknown jobId", () => {
    const gate = makeGate();
    expect(gate.approveJob("nonexistent-id")).toBe(false);
  });

  it("UT-09-03d: rejectJob returns false for unknown jobId", () => {
    const gate = makeGate();
    expect(gate.rejectJob("nonexistent-id")).toBe(false);
  });

  it("UT-09-03e: hasPending returns true before settle, false after", async () => {
    const gate = makeGate();
    const jobId = gate.createJobId();
    void gate.createPendingApproval(jobId);

    expect(gate.hasPending(jobId)).toBe(true);
    gate.approveJob(jobId);
    expect(gate.hasPending(jobId)).toBe(false);
  });
});
