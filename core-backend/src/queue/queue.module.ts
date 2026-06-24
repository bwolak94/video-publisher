import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { JobSyncService } from "./job-sync.service";
import { DlqAlertService } from "./dlq-alert.service";
import { AssetGenerationWorker } from "./workers/asset-generation.worker";
import { RenderWorker } from "./workers/render.worker";
import { GatewayModule } from "../gateway/gateway.module";
import { ElevenLabsModule } from "../elevenlabs/elevenlabs.module";
<<<<<<< Updated upstream
import { MediaModule } from "../media/media.module";

@Module({
  imports: [GatewayModule, ElevenLabsModule, MediaModule],
=======
import { ImagesModule } from "../images/images.module";

@Module({
  imports: [GatewayModule, ElevenLabsModule, ImagesModule],
>>>>>>> Stashed changes
  providers: [
    QueueService,
    JobSyncService,
    DlqAlertService,
    AssetGenerationWorker,
    RenderWorker,
  ],
  exports: [QueueService, JobSyncService, DlqAlertService],
})
export class QueueModule {}
