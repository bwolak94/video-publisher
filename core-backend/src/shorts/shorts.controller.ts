import { Controller, Post, Get, Body, Param, Query } from "@nestjs/common";
import { ShortsService } from "./shorts.service";
import { CreateBriefDto } from "./dto/create-brief.dto";

@Controller("shorts")
export class ShortsController {
  constructor(private readonly shortsService: ShortsService) {}

  @Get()
  listJobs(@Query("limit") limit?: string) {
    return this.shortsService.listJobs(limit ? parseInt(limit, 10) : 20);
  }

  @Get(":jobId")
  getJob(@Param("jobId") jobId: string) {
    return this.shortsService.findJob(jobId);
  }

  @Post("brief")
  async createBrief(@Body() dto: CreateBriefDto) {
    return this.shortsService.generateScenePlan(dto);
  }
}
