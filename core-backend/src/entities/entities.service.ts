/**
 * Visual Consistency System (P1) — Entities service.
 *
 * Manages named entities (characters, locations, props) scoped to a project.
 * Reference image URLs are stored as an S3 URL array so the video generation
 * pipeline can enforce visual consistency across scenes.
 */

import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type Redis from "ioredis";
import { DRIZZLE } from "../db/db.module";
import { REDIS_CLIENT } from "../redis/redis.module";
import * as schema from "../db/schema";
import { entities } from "../db/schema";

const logger = pino({ level: "info" });
const ENTITY_CACHE_TTL_S = 60;

export interface CreateEntityDto {
  name: string;
  type: "character" | "location" | "prop" | "costume";
  description?: string;
  referenceImageUrls?: string[];
  approvedReferenceImageUrl?: string | null;
}

export interface UpdateEntityDto extends Partial<CreateEntityDto> {}

@Injectable()
export class EntitiesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async list(projectId: string): Promise<schema.Entity[]> {
    return this.db.select().from(entities).where(eq(entities.projectId, projectId));
  }

  /** R2: Fetch entities with Redis cache (60s TTL) for use in asset-generation pipeline. */
  async findByProjectIdCached(projectId: string): Promise<schema.Entity[]> {
    const key = `entity-cache:${projectId}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as schema.Entity[];
    const rows = await this.list(projectId);
    await this.redis.set(key, JSON.stringify(rows), "EX", ENTITY_CACHE_TTL_S);
    return rows;
  }

  private async invalidateCache(projectId: string): Promise<void> {
    await this.redis.del(`entity-cache:${projectId}`);
  }

  async create(projectId: string, dto: CreateEntityDto): Promise<schema.Entity> {
    const rows = await this.db
      .insert(entities)
      .values({
        projectId,
        name: dto.name,
        type: dto.type,
        description: dto.description ?? null,
        referenceImageUrls: dto.referenceImageUrls ?? [],
      } as any)
      .returning();
    logger.info({ id: rows[0].id, projectId, name: dto.name }, "Entity created");
    void this.invalidateCache(projectId);
    return rows[0];
  }

  async update(id: string, projectId: string, dto: UpdateEntityDto): Promise<schema.Entity> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined)                         updates.name                       = dto.name;
    if (dto.type !== undefined)                         updates.type                       = dto.type;
    if (dto.description !== undefined)                  updates.description                = dto.description;
    if (dto.referenceImageUrls !== undefined)           updates.referenceImageUrls         = dto.referenceImageUrls;
    if (dto.approvedReferenceImageUrl !== undefined)    updates.approvedReferenceImageUrl  = dto.approvedReferenceImageUrl;

    const rows = await this.db
      .update(entities)
      .set(updates as any)
      .where(and(eq(entities.id, id), eq(entities.projectId, projectId)))
      .returning();
    if (!rows[0]) throw new NotFoundException(`Entity ${id} not found`);
    logger.info({ id, projectId }, "Entity updated");
    void this.invalidateCache(projectId);
    return rows[0];
  }

  /**
   * S3: Set the approved reference image URL for visual conditioning.
   * This URL will be passed as image_url to video/image generation APIs.
   * Must be one of the entity's referenceImageUrls (or any accessible HTTPS URL).
   */
  async approveReference(id: string, projectId: string, imageUrl: string | null): Promise<schema.Entity> {
    const rows = await this.db
      .update(entities)
      .set({ approvedReferenceImageUrl: imageUrl, updatedAt: new Date() } as any)
      .where(and(eq(entities.id, id), eq(entities.projectId, projectId)))
      .returning();
    if (!rows[0]) throw new NotFoundException(`Entity ${id} not found`);
    logger.info({ id, projectId, hasApprovedRef: imageUrl !== null }, "S3: Entity reference approved");
    void this.invalidateCache(projectId);
    return rows[0];
  }

  async delete(id: string, projectId: string): Promise<void> {
    await this.db
      .delete(entities)
      .where(and(eq(entities.id, id), eq(entities.projectId, projectId)));
    logger.info({ id, projectId }, "Entity deleted");
    void this.invalidateCache(projectId);
  }
}
