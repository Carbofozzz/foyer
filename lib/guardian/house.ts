import { and, eq, sql } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { hashSecret, mintToken } from "@/lib/protocol/keys";

let ready = false;

export const DEFAULT_GUARDIAN_NAME = "Guardian";

/** Column and review table for houses that predate this slice. */
export async function ensureGuardianSchema() {
  if (ready) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS watcher boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS guardian_llm_url text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS guardian_llm_model text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS guardian_llm_key text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS guardian_addendum text NOT NULL DEFAULT ''`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS guardian_reviews (
      id text PRIMARY KEY,
      action_id text NOT NULL REFERENCES actions(id),
      revision integer NOT NULL,
      status text NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      error text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS guardian_reviews_action_revision
    ON guardian_reviews (action_id, revision)
  `);
  ready = true;
}

/** One hidden watcher per house. Name is the objector label. No chat key is returned. */
export async function ensureHouseGuardian(principalId: string): Promise<{ id: string; name: string }> {
  await ensureGuardianSchema();
  const db = getDb();
  const [existing] = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.watcher, true)))
    .limit(1);
  if (existing) return existing;
  const id = mintToken("agt");
  await db.insert(agents).values({
    id,
    principalId,
    role: "guardian",
    name: DEFAULT_GUARDIAN_NAME,
    keyHash: hashSecret(mintToken("agk")),
    watcher: true,
    isGuardian: false,
    wake: "outbound",
  });
  return { id, name: DEFAULT_GUARDIAN_NAME };
}
