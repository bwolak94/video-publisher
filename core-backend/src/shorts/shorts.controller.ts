import { Controller, Post, Body } from "@nestjs/common";
import { ShortsService } from "./shorts.service";
import { CreateBriefDto } from "./dto/create-brief.dto";

@Controller("shorts")
export class ShortsController {
  constructor(private readonly shortsService: ShortsService) {}

  @Post("brief")
  async createBrief(@Body() dto: CreateBriefDto) {
    return this.shortsService.generateScenePlan(dto);
  }
}
