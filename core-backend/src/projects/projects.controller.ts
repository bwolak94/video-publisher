import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { ProjectVersionsService } from "./project-versions.service";
import { ShortsSlicerService } from "./shorts-slicer.service";
import { SubtitleExportService } from "../subtitles/subtitle-export.service";
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
    private readonly versions: ProjectVersionsService,
    private readonly slicer: ShortsSlicerService,
    private readonly subtitleExport: SubtitleExportService,
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

  // ── F2: Shorts Slicer ──────────────────────────────────────────────────────

  /**
   * F2: Slice a long-form project into a 9:16 short by picking the top 3 scenes.
   * Returns the new short project ID.
   *
   * POST /api/projects/:id/slice-to-short
   */
  @Post(":id/slice-to-short")
  @HttpCode(HttpStatus.CREATED)
  sliceToShort(@Req() req: any, @Param("id") id: string) {
    return this.slicer.slice(id, req.headers["x-user-id"] ?? null);
  }

  // ── F4: Subtitle Export ────────────────────────────────────────────────────

  /** F4: Download full-video SRT subtitle file. */
  @Get(":id/export/subtitles.srt")
  async exportSrt(@Param("id") id: string, @Res() res: any) {
    const project = await this.projectsService.findOne(id);
    const storyboard = project.storyboard as VideoStoryboard | null;
    if (!storyboard) throw new NotFoundException("No storyboard found");
    const srt = this.subtitleExport.toSrt(storyboard);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${id}.srt"`);
    res.send(srt);
  }

  /** F4: Download full-video VTT subtitle file. */
  @Get(":id/export/subtitles.vtt")
  async exportVtt(@Param("id") id: string, @Res() res: any) {
    const project = await this.projectsService.findOne(id);
    const storyboard = project.storyboard as VideoStoryboard | null;
    if (!storyboard) throw new NotFoundException("No storyboard found");
    const vtt = this.subtitleExport.toVtt(storyboard);
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${id}.vtt"`);
    res.send(vtt);
  }

  // ── F5: Project Versioning ─────────────────────────────────────────────────

  /** F5: List all storyboard snapshots for a project (newest first). */
  @Get(":id/versions")
  listVersions(@Param("id") id: string) {
    return this.versions.findAll(id);
  }

  /** F5: Manually capture a snapshot with an optional label. */
  @Post(":id/versions/snapshot")
  @HttpCode(HttpStatus.CREATED)
  snapshot(@Param("id") id: string, @Body() body: { label?: string }) {
    return this.versions.snapshot(id, body.label);
  }

  /** F5: Restore a project to a specific version. */
  @Post(":id/versions/:versionId/restore")
  @HttpCode(HttpStatus.NO_CONTENT)
  async restoreVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<void> {
    await this.versions.restore(id, versionId);
  }
}
