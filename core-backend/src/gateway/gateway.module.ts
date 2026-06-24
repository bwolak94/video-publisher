import { Module } from "@nestjs/common";
import { EventsGateway } from "./events.gateway";
import { EventCacheService } from "./event-cache.service";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  imports: [AuthModule, ProjectsModule],
  providers: [EventsGateway, EventCacheService],
  exports: [EventsGateway],
})
export class GatewayModule {}
