import { Module, forwardRef } from "@nestjs/common";
import { EventsGateway } from "./events.gateway";
import { EventCacheService } from "./event-cache.service";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { WebhooksModule } from "../webhooks/webhooks.module";

@Module({
  imports: [AuthModule, forwardRef(() => ProjectsModule), WebhooksModule],
  providers: [EventsGateway, EventCacheService],
  exports: [EventsGateway],
})
export class GatewayModule {}
