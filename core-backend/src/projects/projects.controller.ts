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
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { QueueService } from "../queue/queue.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

// Auth is intentionally removed — single-user local dev tool.
// Tech debt: re-add JWT auth in a future auth sprint.
@Controller("api/projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly queueService: QueueService,
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
}
