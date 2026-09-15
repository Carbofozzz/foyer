import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

let ready = false;

export async function ensureWriteHashColumns() {
  if (ready) return;
  const db = getDb();
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS payload_hash text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_write_op text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_write_hash text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE objections ADD COLUMN IF NOT EXISTS payload_hash text NOT NULL DEFAULT ''`);
  ready = true;
}

export function writeHash(body: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(body), "utf8").digest("hex");
}

export function shortWriteHash(hash: string): string {
  const hex = hash.trim();
  if (hex.length <= 12) return hex;
  return hex.slice(0, 12);
}

export async function stampActionWrite(
  actionId: string,
  op: string,
  hash: string,
  extra?: {
    payloadHash?: string;
    lastWriteSigned?: boolean;
    lastWriteSig?: string;
    lastWriteIssuedAt?: Date | null;
    lastWriteKeyGen?: number;
  },
): Promise<void> {
  await getDb()
    .update(actions)
    .set({
      lastWriteOp: op,
      lastWriteHash: hash,
      ...(extra?.payloadHash !== undefined ? { payloadHash: extra.payloadHash } : {}),
      ...(extra?.lastWriteSigned !== undefined ? { lastWriteSigned: extra.lastWriteSigned } : {}),
      ...(extra?.lastWriteSig !== undefined ? { lastWriteSig: extra.lastWriteSig } : {}),
      ...(extra?.lastWriteIssuedAt !== undefined ? { lastWriteIssuedAt: extra.lastWriteIssuedAt } : {}),
      ...(extra?.lastWriteKeyGen !== undefined ? { lastWriteKeyGen: extra.lastWriteKeyGen } : {}),
    })
    .where(eq(actions.id, actionId));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortValue(obj[key]);
  }
  return out;
}
