import {
  Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { NarrationVariantsService, CreateVariantDto, VariantAnalyticsDto } from "./narration-variants.service";

@Controller("api/projects/:projectId/narration-variants")
@UseGuards(AuthGuard)
export class NarrationVariantsController {
  constructor(private readonly service: NarrationVariantsService) {}

  /** List all narration variants for a project (all scenes). */
  @Get()
  listAll(@Param("projectId") projectId: string) {
    return this.service.listForProject(projectId);
  }

  /** List variants for a specific scene. */
  @Get("scenes/:sceneId")
  listForScene(@Param("projectId") projectId: string, @Param("sceneId") sceneId: string) {
    return this.service.listForScene(projectId, sceneId);
  }

  /**
   * Create a narration variant (variantKey "a" or "b") for a scene.
   * Body: { sceneId, variantKey, audioS3Url, voiceId?, scriptText? }
   */
  @Post()
  create(@Param("projectId") projectId: string, @Body() dto: CreateVariantDto) {
    return this.service.create(projectId, dto);
  }

  /**
   * Mark a variant as running with the platform experiment ID.
   * Body: { platformVariantId }
   */
  @Post(":variantId/start-test")
  startTest(
    @Param("variantId") variantId: string,
    @Body() body: { platformVariantId: string },
  ) {
    return this.service.startTest(variantId, body.platformVariantId);
  }

  /**
   * Push platform analytics into a variant for comparison.
   * Body: { views, avgViewDurationPct }
   */
  @Post(":variantId/sync-analytics")
  syncAnalytics(
    @Param("variantId") variantId: string,
    @Body() dto: VariantAnalyticsDto,
  ) {
    return this.service.syncAnalytics(variantId, dto);
  }

  /**
   * Promote the winning variant for a scene.
   * Body: { sceneId, winnerVariantKey: "a" | "b" }
   * The losing variant is automatically rejected.
   */
  @Post("promote")
  @HttpCode(HttpStatus.OK)
  promote(
    @Param("projectId") projectId: string,
    @Body() body: { sceneId: string; winnerVariantKey: "a" | "b" },
  ) {
    return this.service.promoteWinner(projectId, body.sceneId, body.winnerVariantKey);
  }
}
