import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "../../shared/env";
import * as schema from "./schema";

const sql = postgres(env.DATABASE_URL, {
  prepare: false,
});

export const db = drizzle(sql, { schema });
export { sql };
