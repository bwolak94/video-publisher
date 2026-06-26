import { Module } from "@nestjs/common";
import { CostConfigService } from "./cost-config.service";
import { CostEstimatorService } from "./cost-estimator.service";
import { BudgetService } from "./budget.service";
import { BudgetResetService } from "./budget-reset.service";
import { CostRecordService } from "./cost-record.service";
import { CostController } from "./cost.controller";

@Module({
  controllers: [CostController],
  providers: [CostConfigService, CostEstimatorService, BudgetService, BudgetResetService, CostRecordService],
  exports: [BudgetService, CostEstimatorService, CostRecordService],
})
export class CostModule {}
