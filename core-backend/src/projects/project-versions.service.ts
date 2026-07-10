/**
 * F5: Project versioning — auto-snapshots storyboard JSON before any mutating
 * operation so users can roll back to any prior state.
 */
import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq, desc } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { projects, projectVersions } from "../db/schema";
import type { ProjectVersion } from "../db/schema";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

/** Maximum snapshots retained per project (oldest pruned on insert). */
const MAX_VERSIONS_PER_PROJECT = 50;

@Injectable()
export class ProjectVersionsService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /**
   * Capture the current storyboard as a new version.
   * Call this BEFORE any mutating write to `projects.storyboard`.
   */
  async snapshot(projectId: string, label?: string): Promise<ProjectVersion> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new NotFoundException(`Project ${projectId} not found`);

    const [version] = await this.db
      .insert(projectVersions)
      .values({ projectId, storyboard: rows[0].storyboard, label: label ?? null })
      .returning();

    logger.info({ projectId, versionId: version.id, label }, "F5: Storyboard version snapshotted");

    // Prune old versions beyond the cap
    await this.pruneOld(projectId);

    return version;
  }

  /** List all versions for a project, newest first. */
  async findAll(projectId: string): Promise<ProjectVersion[]> {
    return this.db
      .select()
      .from(projectVersions)
      .where(eq(projectVersions.projectId, projectId))
      .orderBy(desc(projectVersions.createdAt));
  }

  /** Restore a project storyboard to a specific version. */
  async restore(projectId: string, versionId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(projectVersions)
      .where(eq(projectVersions.id, versionId))
      .limit(1);

    const version = rows[0];
    if (!version || version.projectId !== projectId) {
      throw new NotFoundException(`Version ${versionId} not found for project ${projectId}`);
    }

    // Snapshot current state before restoring (so restore itself is undoable)
    await this.snapshot(projectId, `before restore to ${versionId}`);

    await this.db
      .update(projects)
      .set({ storyboard: version.storyboard as VideoStoryboard, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    logger.info({ projectId, versionId }, "F5: Project restored to version");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async pruneOld(projectId: string): Promise<void> {
    const all = await this.db
      .select({ id: projectVersions.id })
      .from(projectVersions)
      .where(eq(projectVersions.projectId, projectId))
      .orderBy(desc(projectVersions.createdAt));

    if (all.length > MAX_VERSIONS_PER_PROJECT) {
      const toDelete = all.slice(MAX_VERSIONS_PER_PROJECT).map((r: { id: string }) => r.id);
      for (const id of toDelete) {
        await this.db.delete(projectVersions).where(eq(projectVersions.id, id));
      }
    }
  }
}
