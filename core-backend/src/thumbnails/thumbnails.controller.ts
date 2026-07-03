import { Controller, Post, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
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
}
