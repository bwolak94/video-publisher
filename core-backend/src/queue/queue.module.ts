import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { JobSyncService } from "./job-sync.service";
import { DlqAlertService } from "./dlq-alert.service";
import { DlqService } from "./dlq.service";
import { DlqController } from "./dlq.controller";
import { JobsController } from "./jobs.controller";
import { AssetGenerationWorker } from "./workers/asset-generation.worker";
import { RenderWorker } from "./workers/render.worker";
import { ResearchWorker } from "./workers/research.worker";
import { GatewayModule } from "../gateway/gateway.module";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";
import { MediaModule } from "../media/media.module";
import { ImagesModule } from "../images/images.module";
import { RenderModule } from "../render/render.module";
import { DeduplicationService } from "../worker-mode/deduplication.service";
import { CostModule } from "../cost/cost.module";
import { AlertsModule } from "../alerts/alerts.module";
import { MetricsModule } from "../metrics/metrics.module";
import { QualityGatesModule } from "../quality/quality-gates.module";
import { AssetDedupService } from "./asset-dedup.service";
import { RateLimiterService } from "../common/rate-limiter.service";
import { RenderQualityService } from "../render/render-quality.service";
import { RetryBudgetService } from "./retry-budget.service";
import { QueueDepthPollerService } from "../metrics/queue-depth-poller.service";

@Module({
  imports: [GatewayModule, ElevenLabsModule, MediaModule, ImagesModule, RenderModule, CostModule, AlertsModule, MetricsModule, QualityGatesModule],
  controllers: [DlqController, JobsController],
  providers: [
    QueueService,
    JobSyncService,
    DlqAlertService,
    DlqService,
    AssetGenerationWorker,
    RenderWorker,
    ResearchWorker,
    DeduplicationService,
    AssetDedupService,
    RateLimiterService,
    RenderQualityService,
    RetryBudgetService,
    QueueDepthPollerService,
  ],
  exports: [QueueService, JobSyncService, DlqAlertService, DlqService],
})
export class QueueModule {}
