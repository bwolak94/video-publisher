import { Module } from "@nestjs/common";
import { CostConfigService } from "./cost-config.service";
import { CostEstimatorService } from "./cost-estimator.service";
import { BudgetService } from "./budget.service";
import { BudgetResetService } from "./budget-reset.service";
import { CostRecordService } from "./cost-record.service";
import { CostController } from "./cost.controller";
import { BudgetApprovalGate } from "./budget-approval-gate";
import { ApprovalLogService } from "./approval-log.service";
import { ProjectBudgetService } from "./project-budget.service";

@Module({
  imports: [],
  controllers: [CostController],
  providers: [
    CostConfigService,
    CostEstimatorService,
    BudgetService,
    BudgetResetService,
    CostRecordService,
    BudgetApprovalGate,
    ApprovalLogService,
    ProjectBudgetService,
  ],
  exports: [BudgetService, CostEstimatorService, CostRecordService, BudgetApprovalGate, ApprovalLogService, ProjectBudgetService],
})
export class CostModule {}
