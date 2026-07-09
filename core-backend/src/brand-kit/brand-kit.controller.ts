import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, Query } from "@nestjs/common";
import { BrandKitService, type CreateBrandKitDto, type UpdateBrandKitDto } from "./brand-kit.service";

@Controller()
export class BrandKitController {
  constructor(private readonly brandKits: BrandKitService) {}

  /** GET /api/brand-kits?userId=... — list brand kits for a user */
  @Get("api/brand-kits")
  async list(@Query("userId") userId: string) {
    return this.brandKits.findAll(userId ?? "");
  }

  /** POST /api/brand-kits — create a brand kit */
  @Post("api/brand-kits")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateBrandKitDto) {
    return this.brandKits.create(body);
  }

  /** PATCH /api/brand-kits/:id — update a brand kit */
  @Patch("api/brand-kits/:id")
  async update(@Param("id") id: string, @Body() body: UpdateBrandKitDto) {
    return this.brandKits.update(id, body);
  }

  /** DELETE /api/brand-kits/:id — remove a brand kit */
  @Delete("api/brand-kits/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.brandKits.remove(id);
  }

  /**
   * F04: POST /api/projects/:projectId/apply-brand-kit/:brandKitId
   * Patches brand kit overrides into storyboard.meta so Remotion picks them up at render time.
   */
  @Post("api/projects/:projectId/apply-brand-kit/:brandKitId")
  @HttpCode(HttpStatus.OK)
  async applyToProject(
    @Param("projectId") projectId: string,
    @Param("brandKitId") brandKitId: string,
  ) {
    await this.brandKits.applyToProject(projectId, brandKitId);
    return { ok: true, projectId, brandKitId };
  }
}
