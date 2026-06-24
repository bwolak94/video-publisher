import { Module, Global } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
