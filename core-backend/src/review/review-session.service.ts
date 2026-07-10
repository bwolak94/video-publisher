/**
 * F3: Collaborative Review Mode.
 *
 * Creates shareable read-only links for external reviewers.
 * Reviewers can leave timestamped scene-level comments without authentication.
 */
import { Injectable, Inject, NotFoundException, ForbiddenException } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { reviewSessions, sceneComments, projects } from "../db/schema";
import type { ReviewSession, SceneComment } from "../db/schema";

const logger = pino({ level: "info" });

export interface CreateCommentDto {
  sceneId: string;
  authorName?: string;
  body: string;
  reaction?: string;
}

@Injectable()
export class ReviewSessionService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /** Create a shareable review session for a project. */
  async create(projectId: string, label?: string, expiresInDays = 7): Promise<ReviewSession> {
    // Verify project exists
    const proj = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj[0]) throw new NotFoundException(`Project ${projectId} not found`);

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);

    const [session] = await this.db
      .insert(reviewSessions)
      .values({ projectId, token, label: label ?? null, expiresAt })
      .returning();

    logger.info({ projectId, sessionId: session.id, token: token.slice(0, 8) }, "F3: Review session created");
    return session;
  }

  /** Look up a session by its public token (validates expiry). */
  async findByToken(token: string): Promise<ReviewSession & { storyboard: unknown }> {
    const rows = await this.db
      .select()
      .from(reviewSessions)
      .where(eq(reviewSessions.token, token))
      .limit(1);

    const session = rows[0] as ReviewSession | undefined;
    if (!session) throw new NotFoundException("Review session not found");
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      throw new ForbiddenException("Review session has expired");
    }

    const proj = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, session.projectId))
      .limit(1);

    return { ...session, storyboard: proj[0]?.storyboard ?? null };
  }

  /** List all sessions for a project. */
  async findAllForProject(projectId: string): Promise<ReviewSession[]> {
    return this.db
      .select()
      .from(reviewSessions)
      .where(eq(reviewSessions.projectId, projectId));
  }

  /** Add a comment to a scene via a review token. */
  async addComment(token: string, dto: CreateCommentDto): Promise<SceneComment> {
    const session = await this.findByToken(token); // validates expiry

    const [comment] = await this.db
      .insert(sceneComments)
      .values({
        reviewSessionId: session.id,
        sceneId: dto.sceneId,
        authorName: dto.authorName ?? "Anonymous",
        body: dto.body,
        reaction: dto.reaction ?? null,
      })
      .returning();

    logger.info({ sessionId: session.id, sceneId: dto.sceneId }, "F3: Review comment added");
    return comment;
  }

  /** List all comments for a session. */
  async listComments(token: string): Promise<SceneComment[]> {
    const session = await this.findByToken(token);
    return this.db
      .select()
      .from(sceneComments)
      .where(eq(sceneComments.reviewSessionId, session.id));
  }

  /** Mark a comment as resolved. */
  async resolveComment(commentId: string, projectId: string): Promise<void> {
    // Verify the comment belongs to a session for this project
    const rows = await this.db
      .select({ id: sceneComments.id })
      .from(sceneComments)
      .innerJoin(reviewSessions, eq(sceneComments.reviewSessionId, reviewSessions.id))
      .where(
        and(
          eq(sceneComments.id, commentId),
          eq(reviewSessions.projectId, projectId),
        ),
      )
      .limit(1);

    if (!rows[0]) throw new NotFoundException(`Comment ${commentId} not found`);

    await this.db
      .update(sceneComments)
      .set({ resolvedAt: new Date() })
      .where(eq(sceneComments.id, commentId));
  }
}
