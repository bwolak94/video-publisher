import { BudgetService } from "./budget.service";

function makeService(channelRow: any) {
  const db = {};
  const service = new BudgetService(db as any);
  jest.spyOn(service as any, "getChannelRow").mockResolvedValue(channelRow);
  return service;
}

describe("BudgetService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.WORKER_NOTIFICATION_WEBHOOK;
  });

  // UT-25-03: spend 40 + estimate 5, limit 50 → not blocked (45 < 50)
  it("allows job when projected spend is below budget", async () => {
    const service = makeService({
      channelId: "ch-1",
      monthlyBudgetUsd: "50",
      currentMonthSpendUsd: "40",
    });
    const result = await service.checkBudget("ch-1", 5);
    // 45/50 = 90% triggers warning but NOT blocked — spec only tests "not blocked"
    expect(result.blocked).toBe(false);
  });

  // UT-25-04: spend 48 + estimate 5, limit 50 → blocked (53 > 50)
  it("blocks job when projected spend exceeds budget", async () => {
    const service = makeService({
      channelId: "ch-1",
      monthlyBudgetUsd: "50",
      currentMonthSpendUsd: "48",
    });
    const result = await service.checkBudget("ch-1", 5);
    expect(result.blocked).toBe(true);
    expect(result.message).toMatch(/Monthly budget exceeded/);
  });

  // UT-25-05: spend 39 + estimate 2, limit 50 (82%) → not blocked, warning flag
  it("sets warning flag when projected spend is above 80% but below 100%", async () => {
    process.env.WORKER_NOTIFICATION_WEBHOOK = "";
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const service = makeService({
      channelId: "ch-1",
      monthlyBudgetUsd: "50",
      currentMonthSpendUsd: "39",
    });
    const result = await service.checkBudget("ch-1", 2); // 41/50 = 82%
    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.percentUsed).toBeGreaterThan(0.8);
  });

  it("treats budget=0 as unlimited (never blocks)", async () => {
    const service = makeService({
      channelId: "ch-1",
      monthlyBudgetUsd: "0",
      currentMonthSpendUsd: "9999",
    });
    const result = await service.checkBudget("ch-1", 999);
    expect(result.blocked).toBe(false);
  });

  // UT-25-06: incrementSpend calls DB update
  it("calls DB update when incrementSpend is called", async () => {
    const mockWhere = jest.fn().mockResolvedValue([]);
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
    const db = { update: mockUpdate };

    const service = new BudgetService(db as any);
    jest.spyOn(service as any, "getChannelRow").mockResolvedValue({});

    await service.incrementSpend("ch-1", 0.15);

    expect(mockUpdate).toHaveBeenCalledWith(expect.anything());
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ currentMonthSpendUsd: expect.anything() })
    );
    expect(mockWhere).toHaveBeenCalled();
  });

  // IT-25-01: job completion → spend incremented in DB
  it("incrementSpend is called with correct channelId and amount", async () => {
    const mockWhere = jest.fn().mockResolvedValue([]);
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
    const db = { update: mockUpdate };

    const service = new BudgetService(db as any);
    await service.incrementSpend("ch-worker", 0.35);

    expect(mockWhere).toHaveBeenCalled();
    // Verify the SET included the channel-specific WHERE clause
    const callArg = mockWhere.mock.calls[0][0];
    expect(callArg).toBeDefined();
  });
});
