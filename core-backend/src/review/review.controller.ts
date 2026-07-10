import { Controller, Get, Post, Patch, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { ReviewSessionService, CreateCommentDto } from "./review-session.service";

@Controller("api")
export class ReviewController {
  constructor(private readonly reviewService: ReviewSessionService) {}

  /** Create a shareable review link for a project. */
  @Post("projects/:projectId/review-sessions")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("projectId") projectId: string,
    @Body() body: { label?: string; expiresInDays?: number },
  ) {
    return this.reviewService.create(projectId, body.label, body.expiresInDays);
  }

  /** List all review sessions for a project. */
  @Get("projects/:projectId/review-sessions")
  listForProject(@Param("projectId") projectId: string) {
    return this.reviewService.findAllForProject(projectId);
  }

  /**
   * Public endpoint — no auth required.
   * Returns project storyboard (read-only) so a reviewer can view scenes.
   */
  @Get("review/:token")
  getSession(@Param("token") token: string) {
    return this.reviewService.findByToken(token);
  }

  /** Add a comment to a scene (reviewer-facing, no auth). */
  @Post("review/:token/comments")
  @HttpCode(HttpStatus.CREATED)
  addComment(@Param("token") token: string, @Body() dto: CreateCommentDto) {
    return this.reviewService.addComment(token, dto);
  }

  /** List all comments for a review session. */
  @Get("review/:token/comments")
  listComments(@Param("token") token: string) {
    return this.reviewService.listComments(token);
  }

  /** Resolve a comment (owner-facing). */
  @Patch("projects/:projectId/review-comments/:commentId/resolve")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolveComment(
    @Param("projectId") projectId: string,
    @Param("commentId") commentId: string,
  ): Promise<void> {
    await this.reviewService.resolveComment(commentId, projectId);
  }
}
