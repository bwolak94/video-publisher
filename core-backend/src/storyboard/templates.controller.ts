import { Controller, Get, Post, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { TemplateLibraryService, StoryboardTemplate } from "./template-library.service";
import type { VideoStoryboard } from "./video-storyboard";

@Controller("api/templates")
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(private readonly library: TemplateLibraryService) {}

  /** List all available storyboard templates. */
  @Get()
  listAll(): StoryboardTemplate[] {
    return this.library.listAll();
  }

  /** Get a single template by ID. */
  @Get(":id")
  findOne(@Param("id") id: string): StoryboardTemplate {
    return this.library.findById(id);
  }

  /**
   * Materialise a template into a VideoStoryboard with placeholder narration texts.
   * Query param `voiceId` sets the default voice (defaults to "Rachel").
   * The returned storyboard is ready to be POSTed to /api/projects to create a new project.
   */
  @Post(":id/apply")
  apply(
    @Param("id") id: string,
    @Query("voiceId") voiceId = "Rachel",
  ): VideoStoryboard {
    return this.library.toStoryboard(id, voiceId);
  }
}
