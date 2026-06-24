import { Injectable, NotFoundException, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../db/db.module";
import { projects, users, type Project } from "../db/schema";
import { CreateProjectDto } from "./dto/create-project.dto";

@Injectable()
export class ProjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    // Verify user exists
    const userRows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRows.length === 0) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const newProject = {
      userId,
      title: dto.title,
      mode: dto.mode,
      status: "draft",
    } satisfies Record<string, unknown>;

    const rows = await this.db.insert(projects).values(newProject).returning();
    return rows[0];
  }

  async findAll(userId: string): Promise<Project[]> {
    return this.db.select().from(projects).where(eq(projects.userId, userId));
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
