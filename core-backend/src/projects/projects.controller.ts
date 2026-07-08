import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { QueueService } from "../queue/queue.service";
import { VideoAnalyticsService } from "../metrics/video-analytics.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

// Auth is intentionally removed — single-user local dev tool.
// Tech debt: re-add JWT auth in a future auth sprint.
@Controller("api/projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly queueService: QueueService,
    private readonly analytics: VideoAnalyticsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.headers["x-user-id"] ?? null, dto);
  }

  @Get("stats")
  getStats() {
    return this.projectsService.getStats();
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id);
  }

  @Post(":id/render")
  @HttpCode(HttpStatus.ACCEPTED)
  async render(@Param("id") id: string) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    const storyboard = project.storyboard as VideoStoryboard | null;
    const job = await this.queueService.add("render", {
      projectId: id,
      storyboard: storyboard ?? { meta: {}, timeline: [] },
    });

    return { jobId: job.id, message: "Render queued" };
  }

  @Post(":id/fork")
  @HttpCode(HttpStatus.CREATED)
  fork(@Param("id") id: string) {
    return this.projectsService.fork(id);
  }

  @Get(":id/analytics")
  getAnalytics(@Param("id") id: string) {
    return this.analytics.getLatest(id);
  }

  @Post("import-csv")
  @HttpCode(HttpStatus.CREATED)
  async importCsv(@Req() req: any, @Body() body: { csv: string }) {
    if (!body.csv) throw new BadRequestException("csv field is required");
    return this.projectsService.importFromCsv(body.csv, req.headers["x-user-id"] ?? null);
  }
}
