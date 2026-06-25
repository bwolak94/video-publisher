import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { JobSyncService } from "./job-sync.service";
import { DlqAlertService } from "./dlq-alert.service";
import { AssetGenerationWorker } from "./workers/asset-generation.worker";
import { RenderWorker } from "./workers/render.worker";
import { ResearchWorker } from "./workers/research.worker";
import { GatewayModule } from "../gateway/gateway.module";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";
import { MediaModule } from "../media/media.module";
import { ImagesModule } from "../images/images.module";
import { RenderModule } from "../render/render.module";
import { DeduplicationService } from "../worker-mode/deduplication.service";

@Module({
  imports: [GatewayModule, ElevenLabsModule, MediaModule, ImagesModule, RenderModule],
  providers: [
    QueueService,
    JobSyncService,
    DlqAlertService,
    AssetGenerationWorker,
    RenderWorker,
    ResearchWorker,
    DeduplicationService,
  ],
  exports: [QueueService, JobSyncService, DlqAlertService],
})
export class QueueModule {}
