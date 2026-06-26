import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { CostEstimatorService, type SceneSummary } from "./cost-estimator.service";
import { BudgetService } from "./budget.service";
import { CostRecordService } from "./cost-record.service";

interface EstimateBody {
  scenes: SceneSummary[];
}

@Controller("api/cost")
export class CostController {
  constructor(
    private readonly estimator: CostEstimatorService,
    private readonly budget: BudgetService,
    private readonly costRecord: CostRecordService
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

  @Get("projects/:projectId/breakdown")
  async getProjectCostBreakdown(@Param("projectId") projectId: string) {
    return this.costRecord.getBreakdown(projectId);
  }
}
