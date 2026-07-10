import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { ThumbnailTestService } from "./thumbnail-test.service";

interface StartExperimentBody {
  youtubeVideoId: string;
  channelId: string;
  title: string;
  toneProfile: string;
}

@Controller("api/projects/:projectId/thumbnail-test")
export class ThumbnailsController {
  constructor(private readonly thumbnailTest: ThumbnailTestService) {}

  /** F1: Get the current thumbnail experiment for a project. */
  @Get()
  getCurrent(@Param("projectId") projectId: string) {
    return this.thumbnailTest.getCurrent(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @Param("projectId") projectId: string,
    @Body() body: StartExperimentBody
  ) {
    return this.thumbnailTest.startExperiment(
      projectId,
      body.youtubeVideoId,
      body.channelId,
      body.title,
      body.toneProfile
    );
  }

  /** F1: Pull latest CTR from YouTube Analytics and update variant stats. */
  @Post(":experimentId/sync-ctr")
  @HttpCode(HttpStatus.OK)
  syncCtr(
    @Param("projectId") _projectId: string,
    @Param("experimentId") experimentId: string,
  ) {
    return this.thumbnailTest.syncCtr(experimentId);
  }
}
