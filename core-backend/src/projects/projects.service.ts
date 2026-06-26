import { Injectable, NotFoundException, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
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

  async findAll(): Promise<Project[]> {
    return this.db
      .select()
      .from(projects)
      .orderBy(sql`${projects.updatedAt} desc`);
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
}
