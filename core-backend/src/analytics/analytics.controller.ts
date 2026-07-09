import { Controller, Get, Param } from "@nestjs/common";
import { PublishAnalyticsService } from "./publish-analytics.service";

@Controller("api/analytics")
export class AnalyticsController {
  constructor(private readonly publishAnalytics: PublishAnalyticsService) {}

  /**
   * F05: GET /api/analytics/projects/:projectId/insights
   * Returns GPT-4o synthesized "what worked" patterns from analytics snapshots.
   * The frontend and Creator chat can inject these into future outlines.
   */
  @Get("projects/:projectId/insights")
  async getInsights(@Param("projectId") projectId: string) {
    return this.publishAnalytics.getInsights(projectId);
  }
}
