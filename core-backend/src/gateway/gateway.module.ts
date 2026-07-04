import { Module, forwardRef } from "@nestjs/common";
import { EventsGateway } from "./events.gateway";
import { EventCacheService } from "./event-cache.service";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { CostModule } from "../cost/cost.module";

@Module({
  imports: [AuthModule, forwardRef(() => ProjectsModule), WebhooksModule, CostModule],
  providers: [EventsGateway, EventCacheService],
  exports: [EventsGateway],
})
export class GatewayModule {}
