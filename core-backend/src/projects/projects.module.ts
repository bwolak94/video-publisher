import { Module, forwardRef } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [AuthModule, forwardRef(() => QueueModule)],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
