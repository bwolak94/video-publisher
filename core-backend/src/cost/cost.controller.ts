import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { CostEstimatorService, type SceneSummary } from "./cost-estimator.service";
import { BudgetService } from "./budget.service";

interface EstimateBody {
  scenes: SceneSummary[];
}

@Controller("api/cost")
export class CostController {
  constructor(
    private readonly estimator: CostEstimatorService,
    private readonly budget: BudgetService
  ) {}

  @Post("estimate")
  @HttpCode(HttpStatus.OK)
  estimate(@Body() body: EstimateBody) {
    return this.estimator.estimate(body.scenes);
  }

  @Get("budget/:channelId")
  async getBudget(@Param("channelId") channelId: string) {
    const row = await (this.budget as any).getChannelRow(channelId);
    return {
      channelId,
      monthlyBudgetUsd: parseFloat(row?.monthlyBudgetUsd ?? "0"),
      currentMonthSpendUsd: parseFloat(row?.currentMonthSpendUsd ?? "0"),
    };
  }
}
