import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

let ready = false;

export async function ensureGrantTables(): Promise<void> {
  if (ready) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grants (
      id text PRIMARY KEY,
      action_id text NOT NULL REFERENCES actions(id),
      principal_id text NOT NULL REFERENCES principals(id),
      agent_id text NOT NULL REFERENCES agents(id),
      hand text NOT NULL,
      constraints jsonb NOT NULL,
      expires_at timestamptz NOT NULL,
      uses_remaining integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'active',
      decision text NOT NULL DEFAULT '',
      payload_hash text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS grants_action ON grants(action_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS grants_principal_status ON grants(principal_id, status)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grant_audit (
      id text PRIMARY KEY,
      grant_id text,
      action_id text NOT NULL,
      principal_id text NOT NULL,
      agent_id text,
      kind text NOT NULL,
      hand text NOT NULL DEFAULT '',
      detail jsonb NOT NULL DEFAULT '{}',
      model text NOT NULL DEFAULT '',
      provider text NOT NULL DEFAULT '',
      invocation_id text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS grant_audit_grant ON grant_audit(grant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS grant_audit_principal ON grant_audit(principal_id)`);
  ready = true;
}
