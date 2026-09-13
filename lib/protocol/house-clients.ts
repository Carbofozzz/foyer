import { and, eq, isNotNull, sql } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { agentPromptLines, agentPromptText } from "@/lib/mcp/config";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { parseAgentPrompt, parseAgentWake } from "./parse";
import { sealKey, unsealKey } from "./seal";
import type { WakeKind } from "./types";
import { WAKE_KINDS } from "./types";

let promptColumnReady = false;

export async function ensureAgentPromptColumn() {
  if (promptColumnReady) return;
  const db = getDb();
  await db.execute(
    sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt text NOT NULL DEFAULT ''`,
  );
  promptColumnReady = true;
}

export async function listConnectAgents(principalId: string) {
  await ensureAgentPromptColumn();
  const db = getDb();
  const rows = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.principalId, principalId), eq(agents.isGuardian, false), isNotNull(agents.sealedKey)),
    );
  return rows.map((row) => connectAgentView(row));
}

export async function issueConnectAgent(principal: HousePrincipal, body: Record<string, unknown>) {
  await ensureAgentPromptColumn();
  const trimmed = typeof body.name === "string" ? body.name.trim() : "";
  if (!trimmed) throw new ProtocolError("bad_request", "name is required", 400);
  const spec = parseAgentWake(body);
  const prompt = parseAgentPrompt(body);
  const existing = await findRealAgentByName(principal.id, trimmed);
  if (existing?.sealedKey) {
    if (body.prompt !== undefined || body.system_prompt !== undefined) {
      await saveAgentPrompt(existing.id, principal.id, prompt);
      const fresh = await findRealAgentById(principal.id, existing.id);
      if (fresh) return { ...connectAgentView(fresh), agent_key: unsealKey(existing.sealedKey), created: false };
    }
    return {
      ...connectAgentView(existing),
      agent_key: unsealKey(existing.sealedKey),
      created: false,
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
    systemPrompt: prompt,
  });
  return {
    ...connectAgentView(agent),
    agent_key: agentKey,
    created: true,
    callback_secret: callbackSecret,
  };
}

export async function updateAgentPrompt(principal: HousePrincipal, agentId: string, raw: Record<string, unknown>) {
  await ensureAgentPromptColumn();
  const prompt = parseAgentPrompt(raw);
  const row = await findRealAgentById(principal.id, agentId.trim());
  if (!row?.sealedKey) throw new ProtocolError("not_found", "Unknown agent", 404);
  await saveAgentPrompt(row.id, principal.id, prompt);
  const fresh = await findRealAgentById(principal.id, row.id);
  if (!fresh) throw new ProtocolError("not_found", "Unknown agent", 404);
  return connectAgentView(fresh);
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

function connectAgentView(row: {
  id: string;
  name: string;
  role: string;
  sealedKey: string | null;
  wake: string;
  callbackUrl: string | null;
  sealedCallbackSecret: string | null;
  systemPrompt?: string | null;
}) {
  const prompt = agentPromptText(row.systemPrompt);
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    agent_key: row.sealedKey ? unsealKey(row.sealedKey) : "",
    prompt,
    prompt_lines: agentPromptLines(prompt),
    ...connectPublicFields(row),
  };
}

async function saveAgentPrompt(agentId: string, principalId: string, prompt: string) {
  const db = getDb();
  await db
    .update(agents)
    .set({ systemPrompt: prompt })
    .where(and(eq(agents.id, agentId), eq(agents.principalId, principalId)));
}

async function insertSealedAgent(
  principalId: string,
  input: {
    role: string;
    name: string;
    wake?: WakeKind;
    callbackUrl?: string | null;
    callbackSecret?: string | null;
    systemPrompt?: string;
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
    systemPrompt: input.systemPrompt ?? "",
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

async function findRealAgentById(principalId: string, agentId: string) {
  if (!agentId) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.principalId, principalId),
        eq(agents.isGuardian, false),
        isNotNull(agents.sealedKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
