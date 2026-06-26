import { Module } from "@nestjs/common";
import { AlertService } from "./alert.service";
import { AlertsController } from "./alerts.controller";

@Module({
  controllers: [AlertsController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertsModule {}
