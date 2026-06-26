import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";

// Auth is intentionally removed — single-user local dev tool.
// Tech debt: re-add JWT auth in a future auth sprint.
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
}
