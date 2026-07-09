import { Controller, Post, Get, Put, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { CostEstimatorService, type SceneSummary } from "./cost-estimator.service";
import { BudgetService } from "./budget.service";
import { CostRecordService } from "./cost-record.service";
import { ProjectBudgetService } from "./project-budget.service";

interface EstimateBody {
  scenes: SceneSummary[];
}

@Controller("api/cost")
export class CostController {
  constructor(
    private readonly estimator: CostEstimatorService,
    private readonly budget: BudgetService,
    private readonly costRecord: CostRecordService,
    private readonly projectBudget: ProjectBudgetService,
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

  /** I05: Set a monthly cost budget for a project. 0 = unlimited. */
  @Put("projects/:projectId/budget")
  @HttpCode(HttpStatus.OK)
  async setProjectBudget(
    @Param("projectId") projectId: string,
    @Body() body: { budgetUsd: number },
  ) {
    await this.projectBudget.setBudget(projectId, body.budgetUsd ?? 0);
    return { ok: true, projectId, budgetUsd: body.budgetUsd };
  }

  /** I05: Resume a project that was paused due to budget exceeded. */
  @Post("projects/:projectId/resume-budget")
  @HttpCode(HttpStatus.OK)
  async resumeProjectBudget(@Param("projectId") projectId: string) {
    await this.projectBudget.resumeProject(projectId);
    return { ok: true, projectId };
  }
}
