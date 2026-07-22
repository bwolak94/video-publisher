import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import * as schema from "../db/schema";
import { channels, type Channel, type NewChannel } from "../db/schema";

export interface CreateChannelDto {
  name: string;
  nicheProfile?: Record<string, unknown>;
  youtubeChannelId?: string;
  tiktokUsername?: string;
  instagramUsername?: string;
  brandKitId?: string;
}

export interface UpdateChannelDto extends Partial<CreateChannelDto> {}

@Injectable()
export class ChannelsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async create(userId: string, dto: CreateChannelDto): Promise<Channel> {
    const [row] = await this.db
      .insert(channels)
      .values({
        userId,
        name: dto.name,
        nicheProfile: dto.nicheProfile ?? {},
        youtubeChannelId: dto.youtubeChannelId ?? null,
        tiktokUsername: dto.tiktokUsername ?? null,
        instagramUsername: dto.instagramUsername ?? null,
        brandKitId: dto.brandKitId ?? null,
      } as NewChannel)
      .returning();
    return row;
  }

  async findAll(userId: string): Promise<Channel[]> {
    return this.db.select().from(channels).where(eq(channels.userId, userId));
  }

  async findOne(userId: string, id: string): Promise<Channel> {
    const rows = await this.db
      .select()
      .from(channels)
      .where(and(eq(channels.id, id), eq(channels.userId, userId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`Channel ${id} not found`);
    return rows[0];
  }

  async update(userId: string, id: string, dto: UpdateChannelDto): Promise<Channel> {
    await this.findOne(userId, id); // ownership check

    const [row] = await this.db
      .update(channels)
      .set({
        ...(dto.name !== undefined         && { name: dto.name }),
        ...(dto.nicheProfile !== undefined && { nicheProfile: dto.nicheProfile }),
        ...(dto.youtubeChannelId !== undefined && { youtubeChannelId: dto.youtubeChannelId }),
        ...(dto.tiktokUsername !== undefined   && { tiktokUsername: dto.tiktokUsername }),
        ...(dto.instagramUsername !== undefined && { instagramUsername: dto.instagramUsername }),
        ...(dto.brandKitId !== undefined       && { brandKitId: dto.brandKitId }),
        updatedAt: new Date(),
      } as any)
      .where(eq(channels.id, id))
      .returning();
    return row;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id); // ownership check
    await this.db.delete(channels).where(eq(channels.id, id));
  }
}
