import {
  Controller, Get, Post, Delete,
  Param, Body, Request, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CompetitorAnalysisService } from "./competitor-analysis.service";

@Controller("api/competitors")
@UseGuards(AuthGuard)
export class CompetitorAnalysisController {
  constructor(private readonly service: CompetitorAnalysisService) {}

  /** List tracked competitor channels. */
  @Get()
  list(@Request() req: any) {
    return this.service.listCompetitors(req.user.sub);
  }

  /** Track a new competitor channel. Body: { channelId, channelName? } */
  @Post()
  add(@Request() req: any, @Body() body: { channelId: string; channelName?: string }) {
    return this.service.addCompetitor(req.user.sub, body.channelId, body.channelName);
  }

  /** Remove a tracked competitor channel. */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param("id") id: string) {
    return this.service.removeCompetitor(req.user.sub, id);
  }

  /**
   * Trigger an on-demand gap analysis across all tracked competitors.
   * Fetches latest videos from YouTube Data API and synthesises gaps with GPT-4o.
   */
  @Post("analyze")
  analyze(@Request() req: any) {
    return this.service.analyzeNow(req.user.sub);
  }

  /** Return the most recent gap analysis insights for the user. */
  @Get("insights")
  insights(@Request() req: any) {
    return this.service.getLatestInsights(req.user.sub);
  }
}
