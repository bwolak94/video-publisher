import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
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
import { S3Service } from "../storage/s3.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

// Auth is intentionally removed — single-user local dev tool.
@Controller("api/projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly queueService: QueueService,
    private readonly analytics: VideoAnalyticsService,
    private readonly s3: S3Service,
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

  /** Search projects by title/status/mode with pagination. */
  @Get("search")
  search(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("mode") mode?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.projectsService.search({
      q,
      status,
      mode,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get()
  findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
  ) {
    return this.projectsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.projectsService.delete(id);
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

  /**
   * Return a short-lived presigned URL to download the latest rendered video.
   * Looks up the most recent object under `renders/{projectId}/` in S3.
   */
  @Get(":id/download")
  async download(@Param("id") id: string): Promise<{ url: string; expiresIn: number }> {
    await this.projectsService.findOne(id); // 404 if project missing
    const key = await this.s3.getLatestRenderKey(id);
    if (!key) {
      throw new NotFoundException(`No rendered video found for project ${id}`);
    }
    const url = await this.s3.getPresignedUrl(key, 3600);
    return { url, expiresIn: 3600 };
  }

  @Post("import-csv")
  @HttpCode(HttpStatus.CREATED)
  async importCsv(@Req() req: any, @Body() body: { csv: string }) {
    if (!body.csv) throw new BadRequestException("csv field is required");
    return this.projectsService.importFromCsv(body.csv, req.headers["x-user-id"] ?? null);
  }
}
