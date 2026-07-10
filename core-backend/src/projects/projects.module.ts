import { Module, forwardRef } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { ProjectVersionsService } from "./project-versions.service";
import { ShortsSlicerService } from "./shorts-slicer.service";
import { SubtitleExportService } from "../subtitles/subtitle-export.service";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [AuthModule, forwardRef(() => QueueModule), MetricsModule],
  providers: [ProjectsService, ProjectVersionsService, ShortsSlicerService, SubtitleExportService],
  controllers: [ProjectsController],
  exports: [ProjectsService, ProjectVersionsService],
})
export class ProjectsModule {}
