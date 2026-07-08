import { Module } from "@nestjs/common";
import { WebhookService } from "./webhook.service";
import { WebhooksController } from "./webhooks.controller";
import { WebhookDeliveryWorker } from "../queue/workers/webhook-delivery.worker";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [QueueModule],
  controllers: [WebhooksController],
  providers: [WebhookService, WebhookDeliveryWorker],
  exports: [WebhookService],
})
export class WebhooksModule {}
