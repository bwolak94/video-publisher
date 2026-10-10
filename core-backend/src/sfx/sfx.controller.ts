import { Controller, Get, Query } from "@nestjs/common";
import { SfxService } from "./sfx.service";
import type { SfxEntry } from "./sfx.types";

/**
 * SFX library endpoint.
 *
 * GET /sfx          — returns all entries
 * GET /sfx?tags=    — returns entries ranked by Jaccard similarity
 */
@Controller("sfx")
export class SfxController {
  constructor(private readonly sfxService: SfxService) {}

  @Get()
  findByTags(@Query("tags") tagsParam?: string): Promise<SfxEntry[]> {
    const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : [];
    if (tags.length === 0) return this.sfxService.findAll();
    return this.sfxService.findByTags(tags);
  }
}
