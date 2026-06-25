import { Module } from "@nestjs/common";
import { NicheProfileService } from "./niche-profile.service";
import { DeduplicationService } from "./deduplication.service";
import { WorkerModeService } from "./worker-mode.service";
import { CronWorkerService } from "./cron-worker.service";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [QueueModule],
  providers: [
    NicheProfileService,
    DeduplicationService,
    WorkerModeService,
    CronWorkerService,
  ],
  exports: [NicheProfileService, DeduplicationService, WorkerModeService],
})
export class WorkerModeModule {}
