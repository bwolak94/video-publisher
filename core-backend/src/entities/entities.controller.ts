import { Controller, Get, Post, Put, Patch, Delete, Param, Body, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { EntitiesService, type CreateEntityDto, type UpdateEntityDto } from "./entities.service";
import { AuthGuard } from "../auth/auth.guard";

@UseGuards(AuthGuard)
@Controller()
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  /** GET /api/projects/:projectId/entities — list all entities for a project */
  @Get("api/projects/:projectId/entities")
  async list(@Param("projectId") projectId: string) {
    return this.entitiesService.list(projectId);
  }

  /** POST /api/projects/:projectId/entities — create a new entity */
  @Post("api/projects/:projectId/entities")
  @HttpCode(HttpStatus.CREATED)
  async create(@Param("projectId") projectId: string, @Body() body: CreateEntityDto) {
    return this.entitiesService.create(projectId, body);
  }

  /** PUT /api/projects/:projectId/entities/:id — update an entity */
  @Put("api/projects/:projectId/entities/:id")
  async update(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: UpdateEntityDto,
  ) {
    return this.entitiesService.update(id, projectId, body);
  }

  /** DELETE /api/projects/:projectId/entities/:id — delete an entity */
  @Delete("api/projects/:projectId/entities/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("projectId") projectId: string, @Param("id") id: string) {
    await this.entitiesService.delete(id, projectId);
  }

  /**
   * S3: PATCH /api/projects/:projectId/entities/:id/approve-reference
   * Set (or clear) the approved reference image URL for visual conditioning.
   * Body: { imageUrl: string | null }
   */
  @Patch("api/projects/:projectId/entities/:id/approve-reference")
  async approveReference(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: { imageUrl: string | null },
  ) {
    return this.entitiesService.approveReference(id, projectId, body.imageUrl ?? null);
  }
}
