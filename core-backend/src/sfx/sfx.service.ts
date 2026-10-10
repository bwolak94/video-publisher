import { Injectable, Inject } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../db/db.module";
import { sfxLibrary } from "../db/schema";
import * as schema from "../db/schema";
import type { SfxEntry } from "./sfx.types";

@Injectable()
export class SfxService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  /**
   * Returns all SFX entries sorted by Jaccard similarity against the provided
   * tags.  Entries with zero overlap are excluded.
   *
   * Jaccard: |intersection| / |union|
   */
  async findByTags(tags: string[]): Promise<SfxEntry[]> {
    const queryTags = tags.map((t) => t.toLowerCase());
    const rows = await this.db.select().from(sfxLibrary);

    const ranked = rows
      .map((row) => {
        const rowTags = (row.tags ?? []).map((t) => t.toLowerCase());
        const intersection = queryTags.filter((t) => rowTags.includes(t)).length;
        const union = new Set([...queryTags, ...rowTags]).size;
        const score = union === 0 ? 0 : intersection / union;
        return { ...row, _score: score };
      })
      .filter((r) => r._score > 0)
      .sort((a, b) => b._score - a._score);

    return ranked.map(({ _score: _unused, ...entry }) => entry as SfxEntry);
  }

  /** Returns all SFX entries ordered by name. */
  async findAll(): Promise<SfxEntry[]> {
    return this.db.select().from(sfxLibrary) as Promise<SfxEntry[]>;
  }
}
