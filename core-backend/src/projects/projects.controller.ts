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
  Sse,
  MessageEvent,
} from "@nestjs/common";
import { Observable, interval } from "rxjs";
import { switchMap, take, map } from "rxjs/operators";
import { ProjectsService } from "./projects.service";
import { ProjectVersionsService } from "./project-versions.service";
import { ShortsSlicerService } from "./shorts-slicer.service";
import { SubtitleExportService } from "../subtitles/subtitle-export.service";
import { BulkRegenerateService, type BulkRegenerateOptions } from "./bulk-regenerate.service";
import { RenderQualityService } from "../render/render-quality.service";
import { JobSyncService } from "../queue/job-sync.service";
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
    private readonly bulkRegen: BulkRegenerateService,
    private readonly renderQuality: RenderQualityService,
    private readonly jobSync: JobSyncService,
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

  // ── I1: SSE Job Progress ───────────────────────────────────────────────────

  /**
   * I1: Server-Sent Events stream of job progress for a project.
   * Emits every 2s for up to 5 minutes (150 ticks), then closes.
   *
   * GET /api/projects/:id/progress  (text/event-stream)
   */
  @Sse(":id/progress")
  progress(@Param("id") id: string): Observable<MessageEvent> {
    return interval(2_000).pipe(
      take(150),
      switchMap(() => this.jobSync.findByProjectId(id)),
      map((jobList) => ({ data: { projectId: id, jobs: jobList } } as MessageEvent)),
    );
  }

  // ── I2: Bulk Regeneration ──────────────────────────────────────────────────

  /**
   * I2: Bulk-regenerate selected scenes with cost preview.
   * `confirm: false` (default) → dry run, returns cost estimate only.
   * `confirm: true` → validates budget then enqueues jobs.
   *
   * POST /api/projects/:id/bulk-regenerate
   */
  @Post(":id/bulk-regenerate")
  async bulkRegenerate(@Param("id") id: string, @Body() body: BulkRegenerateOptions) {
    return this.bulkRegen.run(id, body);
  }

  // ── I4: Render Quality ─────────────────────────────────────────────────────

  /**
   * I4: Return the latest render quality report (populated post-render by ffprobe).
   *
   * GET /api/projects/:id/render-quality
   */
  @Get(":id/render-quality")
  async getRenderQuality(@Param("id") id: string) {
    const project = await this.projectsService.findOne(id);
    const report = (project as any).postRenderQuality;
    if (!report) throw new NotFoundException("No render quality report available yet");
    return report;
  }

  // ── I6: Project Bundle Export ──────────────────────────────────────────────

  /**
   * I6: Export project as a JSON bundle containing storyboard, subtitles, and
   * presigned S3 URLs for all scene media assets.
   *
   * GET /api/projects/:id/export/bundle.json
   */
  @Get(":id/export/bundle.json")
  async exportBundle(@Param("id") id: string) {
    const project = await this.projectsService.findOne(id);
    const storyboard = project.storyboard as VideoStoryboard | null;
    if (!storyboard) throw new NotFoundException("No storyboard found");

    let srt = "";
    let vtt = "";
    try { srt = this.subtitleExport.toSrt(storyboard); } catch { /* no subtitles yet */ }
    try { vtt = this.subtitleExport.toVtt(storyboard); } catch { /* no subtitles yet */ }

    // Resolve presigned URLs for all scene media assets
    const scenes = await Promise.all(
      storyboard.timeline.map(async (scene) => {
        const resolve = async (url?: string) => {
          if (!url?.startsWith("s3://")) return url ?? null;
          const key = url.slice("s3://".length).split("/").slice(1).join("/");
          return this.s3.getPresignedUrl(key, 3600).catch(() => null);
        };
        return {
          sceneId: scene.sceneId,
          sequenceNumber: scene.sequenceNumber,
          narrationText: scene.narrationText,
          visualPrompt: scene.visualPrompt,
          durationInSeconds: scene.durationInSeconds,
          videoUrl: await resolve(scene.videoUrl),
          audioUrl: await resolve(scene.audioUrl),
        };
      }),
    );

    return {
      projectId: project.id,
      title: project.title,
      exportedAt: new Date().toISOString(),
      storyboard,
      subtitles: { srt, vtt },
      scenes,
    };
  }

  // ── I7: Music Preview ──────────────────────────────────────────────────────

  /**
   * I7: Return a short-lived presigned URL for the project's background music track.
   *
   * GET /api/projects/:id/music/preview
   */
  @Get(":id/music/preview")
  async musicPreview(@Param("id") id: string): Promise<{ url: string; expiresIn: number }> {
    const project = await this.projectsService.findOne(id);
    const storyboard = project.storyboard as VideoStoryboard | null;
    const musicUrl = storyboard?.meta?.musicTrack?.s3Url;

    if (!musicUrl?.startsWith("s3://")) {
      throw new NotFoundException("No music track found for this project");
    }

    const key = musicUrl.slice("s3://".length).split("/").slice(1).join("/");
    const url = await this.s3.getPresignedUrl(key, 30);
    return { url, expiresIn: 30 };
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
