import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    cached = drizzle(neon(requireDatabaseUrl()), { schema });
  }
  return cached;
}
