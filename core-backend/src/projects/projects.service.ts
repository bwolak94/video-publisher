import { Injectable, NotFoundException, Inject } from "@nestjs/common";
import { eq, sql, ilike, and, ne } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { projects, type Project } from "../db/schema";
import { CreateProjectDto } from "./dto/create-project.dto";

@Injectable()
export class ProjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async create(userId: string | null, dto: CreateProjectDto): Promise<Project> {
    const newProject = {
      userId: userId ?? undefined,
      title: dto.title,
      mode: dto.mode,
      status: "draft",
    } satisfies Record<string, unknown>;

    const rows = await this.db.insert(projects).values(newProject).returning();
    return rows[0];
  }

  async findAll(opts: { page?: number; limit?: number; status?: string } = {}): Promise<{ data: Project[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    // Base condition: never return deleted projects (unless explicitly requested)
    const statusFilter = opts.status
      ? eq(projects.status, opts.status)
      : ne(projects.status, "deleted");

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(projects)
        .where(statusFilter)
        .orderBy(sql`${projects.updatedAt} desc`)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(statusFilter),
    ]);

    return { data, total: countResult[0]?.count ?? 0, page, limit };
  }

  async search(opts: { q?: string; status?: string; mode?: string; page?: number; limit?: number }): Promise<{ data: Project[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [ne(projects.status, "deleted")];
    if (opts.q) conditions.push(ilike(projects.title, `%${opts.q}%`));
    if (opts.status) conditions.push(eq(projects.status, opts.status));
    if (opts.mode) conditions.push(eq(projects.mode, opts.mode));

    const where = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.db.select().from(projects).where(where)
        .orderBy(sql`${projects.updatedAt} desc`).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(projects).where(where),
    ]);

    return { data, total: countResult[0]?.count ?? 0, page, limit };
  }

  async getStats(): Promise<{
    totalProjects: number;
    totalScenes: number;
    projectsByStatus: Record<string, number>;
    cacheHitRate: number;
    totalDuration: number;
  }> {
    const rows: Project[] = await this.db.select().from(projects);

    const projectsByStatus: Record<string, number> = {};
    let totalScenes = 0;

    for (const p of rows) {
      projectsByStatus[p.status ?? "draft"] = (projectsByStatus[p.status ?? "draft"] ?? 0) + 1;
      const storyboard = p.storyboard as { scenes?: unknown[] } | null;
      if (storyboard?.scenes) {
        totalScenes += storyboard.scenes.length;
      }
    }

    return {
      totalProjects: rows.length,
      totalScenes,
      projectsByStatus,
      cacheHitRate: 0,
      totalDuration: 0,
    };
  }

  async findOne(id: string): Promise<Project> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return rows[0];
  }

  async createWithStoryboard(
    title: string,
    storyboard: Record<string, unknown>,
    userId?: string | null,
    researchBrief?: Record<string, unknown> | null,
    referenceVideoUrl?: string | null,
    referenceAnalysis?: Record<string, unknown> | null,
  ): Promise<Project> {
    const rows = await this.db
      .insert(projects)
      .values({
        userId: userId ?? undefined,
        title,
        mode: "creator",
        status: "draft",
        storyboard,
        researchBrief: researchBrief ?? undefined,
        researchCompletedAt: researchBrief ? new Date() : undefined,
        referenceVideoUrl: referenceVideoUrl ?? undefined,
        referenceAnalysis: referenceAnalysis ?? undefined,
      })
      .returning();
    return rows[0];
  }

  async updateStoryboard(id: string, storyboard: Record<string, unknown>): Promise<void> {
    await this.db
      .update(projects)
      .set({ storyboard, updatedAt: new Date() })
      .where(eq(projects.id, id));
  }

  /** Soft-delete a project — sets status to "deleted". */
  async delete(id: string): Promise<void> {
    await this.findOne(id); // throws NotFoundException if not found
    await this.db
      .update(projects)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(projects.id, id));
  }

  /**
   * Duplicate a project — copies title (with " (copy)" suffix), storyboard,
   * and metadata into a new draft project.
   */
  async fork(id: string): Promise<Project> {
    const source = await this.findOne(id);
    const rows = await this.db
      .insert(projects)
      .values({
        userId: source.userId ?? undefined,
        title: `${source.title} (copy)`,
        mode: source.mode,
        status: "draft",
        storyboard: source.storyboard as Record<string, unknown> ?? undefined,
        researchBrief: source.researchBrief as Record<string, unknown> ?? undefined,
        referenceVideoUrl: source.referenceVideoUrl ?? undefined,
        referenceAnalysis: source.referenceAnalysis as Record<string, unknown> ?? undefined,
      })
      .returning();
    return rows[0];
  }

  /**
   * Batch-import projects from a CSV string.
   * Expected columns (header required): title,mode
   * Additional columns are ignored. Blank rows are skipped.
   */
  async importFromCsv(csv: string, userId?: string | null): Promise<Project[]> {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return []; // header only or empty

    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
    const titleIdx = headers.indexOf("title");
    const modeIdx = headers.indexOf("mode");

    if (titleIdx === -1) throw new Error("CSV must have a 'title' column");

    const created: Project[] = [];
    for (const line of dataLines) {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const title = cols[titleIdx];
      if (!title) continue;
      const mode = (modeIdx >= 0 ? cols[modeIdx] : "") || "creator";
      const row = await this.create(userId ?? null, { title, mode: mode as "creator" | "worker" });
      created.push(row);
    }
    return created;
  }
}
