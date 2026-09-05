import { and, count, eq, inArray } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ProtocolError } from "./errors";

export const ABUSE = {
  justification: 2_000,
  summary: 500,
  currency: 8,
  extraKeys: 6,
  extraChars: 400,
  evidenceItems: 8,
  evidenceValue: 2_000,
  openActions: 24,
  bodyBytes: 16_384,
} as const;

const BUSY = ["open", "awaiting_ack"] as const;

/** Caps flood: a stolen key cannot leave dozens of open actions in one house. */
export async function assertHouseProposeRoom(principalId: string) {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(actions)
    .where(and(eq(actions.principalId, principalId), inArray(actions.status, [...BUSY])));
  if ((row?.n ?? 0) >= ABUSE.openActions) {
    throw new ProtocolError("conflict", "Too many open actions in this house", 409);
  }
}

export function assertJustification(value: string) {
  if (value.length > ABUSE.justification) {
    throw new ProtocolError("bad_request", "justification is too long", 400);
  }
}

export async function readBoundedJson(request: Request, maxBytes = ABUSE.bodyBytes): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ProtocolError("payload_too_large", "Body is too large", 413);
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new ProtocolError("payload_too_large", "Body is too large", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProtocolError("bad_request", "JSON body required", 400);
  }
}
