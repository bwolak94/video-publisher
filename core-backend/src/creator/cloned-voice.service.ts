import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { clonedVoices } from "../db/schema";

@Injectable()
export class ClonedVoiceService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async persist(voiceId: string, voiceName: string, sourceVideoUrl: string, userId?: string | null): Promise<void> {
    await this.db.insert(clonedVoices).values({
      voiceId,
      voiceName,
      sourceVideoUrl,
      userId: userId ?? null,
      provider: "elevenlabs",
    });
  }

  async findAll(userId?: string | null): Promise<Array<{ id: string; voiceId: string; voiceName: string; sourceVideoUrl: string | null; provider: string; createdAt: string }>> {
    const rows = userId
      ? await this.db.select().from(clonedVoices).where(eq(clonedVoices.userId, userId))
      : await this.db.select().from(clonedVoices);

    return rows.map((r: any) => ({
      id:             r.id,
      voiceId:        r.voiceId,
      voiceName:      r.voiceName,
      sourceVideoUrl: r.sourceVideoUrl ?? null,
      provider:       r.provider,
      createdAt:      r.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
  }
}
