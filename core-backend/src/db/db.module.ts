import { Module, Global, Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as path from "path";
import * as schema from "./schema";
import { configuration } from "../config/configuration";

export const DRIZZLE = Symbol("DRIZZLE");

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => {
        const config = configuration();
        const pool = new Pool({ connectionString: config.database.url });
        return drizzle(pool, { schema });
      },
    },
    {
      provide: "DB_POOL",
      useFactory: () => {
        const config = configuration();
        return new Pool({ connectionString: config.database.url });
      },
    },
  ],
  exports: [DRIZZLE, "DB_POOL"],
})
export class DbModule {}

/**
 * Runs Drizzle migrations on application start (UC-01).
 * Skip gracefully when the DB is unavailable (e.g. unit tests with mocked pool).
 */
export async function runMigrations(db: any): Promise<void> {
  const logger = new Logger("DbMigrations");
  try {
    const migrationsFolder = path.join(__dirname, "..", "..", "drizzle", "migrations");
    await migrate(db, { migrationsFolder });
    logger.log("Migrations applied successfully");
  } catch (err: any) {
    logger.warn(`Migration skipped or failed: ${err.message}`);
  }
}
