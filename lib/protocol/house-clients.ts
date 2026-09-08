import { and, eq, isNotNull } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { parseAgentWake } from "./parse";
import { sealKey, unsealKey } from "./seal";
import type { WakeKind } from "./types";
import { WAKE_KINDS } from "./types";

export async function listConnectAgents(principalId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.principalId, principalId), eq(agents.isGuardian, false), isNotNull(agents.sealedKey)),
    );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    agent_key: row.sealedKey ? unsealKey(row.sealedKey) : "",
    ...connectPublicFields(row),
  }));
}

export async function issueConnectAgent(principal: HousePrincipal, body: Record<string, unknown>) {
  const trimmed = typeof body.name === "string" ? body.name.trim() : "";
  if (!trimmed) throw new ProtocolError("bad_request", "name is required", 400);
  const spec = parseAgentWake(body);
  const existing = await findRealAgentByName(principal.id, trimmed);
  if (existing?.sealedKey) {
    return {
      id: existing.id,
      agent_key: unsealKey(existing.sealedKey),
      created: false,
      role: existing.role,
      name: existing.name,
      ...connectPublicFields(existing),
    };
  }
  const role = roleFromName(trimmed);
  const callbackSecret =
    spec.wake === "callback" ? spec.callbackSecret || mintToken("whk") : null;
  const { agent, agentKey } = await insertSealedAgent(principal.id, {
    role,
    name: trimmed,
    wake: spec.wake,
    callbackUrl: spec.callbackUrl,
    callbackSecret,
  });
  return {
    id: agent.id,
    agent_key: agentKey,
    created: true,
    role,
    name: trimmed,
    ...connectPublicFields(agent),
    callback_secret: callbackSecret,
  };
}

export function connectPublicFields(row: {
  wake: string;
  callbackUrl: string | null;
  sealedCallbackSecret: string | null;
}) {
  const wake: WakeKind = WAKE_KINDS.includes(row.wake as WakeKind) ? (row.wake as WakeKind) : "outbound";
  const callback_url = wake === "callback" ? row.callbackUrl : null;
  return {
    wake,
    callback_url,
    hook_ok: wake === "callback" && Boolean(callback_url && row.sealedCallbackSecret),
  };
}

async function insertSealedAgent(
  principalId: string,
  input: {
    role: string;
    name: string;
    wake?: WakeKind;
    callbackUrl?: string | null;
    callbackSecret?: string | null;
  },
) {
  const db = getDb();
  const id = mintToken("agt");
  const agentKey = mintToken("agk");
  const wake = input.wake ?? "outbound";
  await db.insert(agents).values({
    id,
    principalId,
    role: input.role,
    name: input.name,
    keyHash: hashSecret(agentKey),
    sealedKey: sealKey(agentKey),
    isGuardian: false,
    wake,
    callbackUrl: input.callbackUrl ?? null,
    sealedCallbackSecret: input.callbackSecret ? sealKey(input.callbackSecret) : null,
  });
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new ProtocolError("internal", "Failed to create agent", 500);
  return { agent: row, agentKey };
}

function roleFromName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "agent";
}

async function findRealAgentByName(principalId: string, name: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.principalId, principalId),
        eq(agents.name, name),
        eq(agents.isGuardian, false),
        isNotNull(agents.sealedKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
