/**
 * F04: Brand Kit service — CRUD + project application.
 *
 * Brand kits store per-user branding presets (logo, colors, font, lower-third style,
 * intro/outro clips) that are applied automatically to the storyboard.meta at render time.
 */

import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import pino from "pino";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { brandKits, projects } from "../db/schema";

const logger = pino({ level: "info" });

export interface CreateBrandKitDto {
  userId: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  lowerThirdStyle?: Record<string, unknown>;
  introClipS3Url?: string;
  outroClipS3Url?: string;
}

export interface UpdateBrandKitDto extends Partial<Omit<CreateBrandKitDto, "userId">> {}

@Injectable()
export class BrandKitService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(userId: string): Promise<schema.BrandKit[]> {
    return this.db.select().from(brandKits).where(eq(brandKits.userId, userId));
  }

  async findOne(id: string): Promise<schema.BrandKit> {
    const rows = await this.db.select().from(brandKits).where(eq(brandKits.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundException(`Brand kit ${id} not found`);
    return rows[0];
  }

  async create(dto: CreateBrandKitDto): Promise<schema.BrandKit> {
    const rows = await this.db
      .insert(brandKits)
      .values({
        userId: dto.userId,
        name: dto.name,
        logoUrl: dto.logoUrl ?? null,
        primaryColor: dto.primaryColor ?? "#ffffff",
        secondaryColor: dto.secondaryColor ?? "#000000",
        fontFamily: dto.fontFamily ?? "Inter",
        lowerThirdStyle: dto.lowerThirdStyle ?? {},
        introClipS3Url: dto.introClipS3Url ?? null,
        outroClipS3Url: dto.outroClipS3Url ?? null,
      } as any)
      .returning();
    logger.info({ id: rows[0].id, name: dto.name }, "Brand kit created");
    return rows[0];
  }

  async update(id: string, dto: UpdateBrandKitDto): Promise<schema.BrandKit> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined)             updates.name             = dto.name;
    if (dto.logoUrl !== undefined)          updates.logoUrl          = dto.logoUrl;
    if (dto.primaryColor !== undefined)     updates.primaryColor     = dto.primaryColor;
    if (dto.secondaryColor !== undefined)   updates.secondaryColor   = dto.secondaryColor;
    if (dto.fontFamily !== undefined)       updates.fontFamily       = dto.fontFamily;
    if (dto.lowerThirdStyle !== undefined)  updates.lowerThirdStyle  = dto.lowerThirdStyle;
    if (dto.introClipS3Url !== undefined)   updates.introClipS3Url  = dto.introClipS3Url;
    if (dto.outroClipS3Url !== undefined)   updates.outroClipS3Url  = dto.outroClipS3Url;

    const rows = await this.db.update(brandKits).set(updates as any).where(eq(brandKits.id, id)).returning();
    if (!rows[0]) throw new NotFoundException(`Brand kit ${id} not found`);
    logger.info({ id }, "Brand kit updated");
    return rows[0];
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(brandKits).where(eq(brandKits.id, id));
    logger.info({ id }, "Brand kit deleted");
  }

  /**
   * Apply brand kit overrides to a project's storyboard.meta.
   * Patches primaryColor, fontFamily, introClipS3Url, outroClipS3Url and lowerThirdStyle
   * into the storyboard JSON so the Remotion composition can pick them up at render time.
   */
  async applyToProject(projectId: string, brandKitId: string): Promise<void> {
    const kit = await this.findOne(brandKitId);

    const rows = await this.db
      .select({ storyboard: projects.storyboard })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!rows[0]) throw new NotFoundException(`Project ${projectId} not found`);

    const storyboard = (rows[0].storyboard as Record<string, any>) ?? {};
    const meta = storyboard.meta ?? {};

    const updatedStoryboard = {
      ...storyboard,
      meta: {
        ...meta,
        brandKitId,
        primaryColor:    kit.primaryColor,
        secondaryColor:  kit.secondaryColor,
        fontFamily:      kit.fontFamily,
        logoUrl:         kit.logoUrl,
        lowerThirdStyle: kit.lowerThirdStyle,
        introClipS3Url:  kit.introClipS3Url,
        outroClipS3Url:  kit.outroClipS3Url,
      },
    };

    await this.db
      .update(projects)
      .set({ storyboard: updatedStoryboard, updatedAt: new Date() } as any)
      .where(eq(projects.id, projectId));

    logger.info({ projectId, brandKitId }, "Brand kit applied to project");
  }
}
