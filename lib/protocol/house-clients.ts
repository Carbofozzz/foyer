import { and, eq, isNotNull, sql } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { agentPromptLines, agentPromptText, promptShaOf } from "@/lib/mcp/config";
import type { HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { hashSecret, mintToken } from "./keys";
import { parseAgentPrompt, parseAgentWake, parseCourtCap, parseCourtLabel } from "./parse";
import { sealKey, unsealKey } from "./seal";
import type { WakeKind } from "./types";
import { WAKE_KINDS } from "./types";
import { ensureWriteSignColumns, mintSignSecret, sealSignSecret } from "./write-sign";

let promptColumnReady = false;

export async function ensureAgentPromptColumn() {
  if (promptColumnReady) return;
  const db = getDb();
  await db.execute(
    sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt text NOT NULL DEFAULT ''`,
  );
  await db.execute(
    sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS court_label text NOT NULL DEFAULT ''`,
  );
  await db.execute(
    sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS court_cap text NOT NULL DEFAULT ''`,
  );
  await db.execute(sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS prompt_sha text NOT NULL DEFAULT ''`);
  promptColumnReady = true;
}

export async function listConnectAgents(principalId: string) {
  await ensureAgentPromptColumn();
  await ensureWriteSignColumns();
  const db = getDb();
  const rows = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.principalId, principalId), eq(agents.isGuardian, false), isNotNull(agents.sealedKey)),
    );
  for (const row of rows) {
    if (!row.sealedSignSecret) await fillSignSecret(row.id);
    if (!row.promptSha) {
      await getDb().update(agents).set({ promptSha: promptShaOf(row.systemPrompt) }).where(eq(agents.id, row.id));
    }
  }
  const fresh = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.principalId, principalId), eq(agents.isGuardian, false), isNotNull(agents.sealedKey)),
    );
  return fresh.map((row) => connectAgentView(row));
}

export async function rotateConnectAgent(principal: HousePrincipal, agentId: string) {
  await ensureAgentPromptColumn();
  await ensureWriteSignColumns();
  const row = await findRealAgentById(principal.id, agentId.trim());
  if (!row?.sealedKey) throw new ProtocolError("not_found", "Unknown agent", 404);
  const agentKey = mintToken("agk");
  const signSecret = mintSignSecret();
  await getDb()
    .update(agents)
    .set({
      keyHash: hashSecret(agentKey),
      sealedKey: sealKey(agentKey),
      sealedSignSecret: sealSignSecret(signSecret),
      keyGen: (row.keyGen ?? 1) + 1,
    })
    .where(and(eq(agents.id, row.id), eq(agents.principalId, principal.id)));
  const fresh = await findRealAgentById(principal.id, row.id);
  if (!fresh) throw new ProtocolError("not_found", "Unknown agent", 404);
  return {
    ...connectAgentView(fresh),
    agent_key: agentKey,
    sign_secret: signSecret,
    created: false,
    rotated: true,
  };
}

export async function issueConnectAgent(principal: HousePrincipal, body: Record<string, unknown>) {
  await ensureAgentPromptColumn();
  await ensureWriteSignColumns();
  const trimmed = typeof body.name === "string" ? body.name.trim() : "";
  if (!trimmed) throw new ProtocolError("bad_request", "name is required", 400);
  const spec = parseAgentWake(body);
  const prompt = parseAgentPrompt(body);
  const courtLabel = parseCourtLabel(body.court_label);
  const courtCap = parseCourtCap(body.court_cap);
  const existing = await findRealAgentByName(principal.id, trimmed);
  if (existing?.sealedKey) {
    if (!existing.sealedSignSecret) await fillSignSecret(existing.id);
    if (body.prompt !== undefined || body.system_prompt !== undefined || body.court_label !== undefined || body.court_cap !== undefined) {
      await saveAgentConnect(existing.id, principal.id, {
        ...(body.prompt !== undefined || body.system_prompt !== undefined ? { systemPrompt: prompt } : {}),
        ...(body.court_label !== undefined ? { courtLabel } : {}),
        ...(body.court_cap !== undefined ? { courtCap } : {}),
      });
    }
    const fresh = await findRealAgentById(principal.id, existing.id);
    if (fresh) return { ...connectAgentView(fresh), agent_key: unsealKey(existing.sealedKey), created: false };
    return {
      ...connectAgentView(existing),
      agent_key: unsealKey(existing.sealedKey),
      created: false,
    };
  }
  const role = roleFromName(trimmed);
  const callbackSecret =
    spec.wake === "callback" ? spec.callbackSecret || mintToken("whk") : null;
  const { agent, agentKey, signSecret } = await insertSealedAgent(principal.id, {
    role,
    name: trimmed,
    wake: spec.wake,
    callbackUrl: spec.callbackUrl,
    callbackSecret,
    systemPrompt: prompt,
    courtLabel,
    courtCap,
  });
  return {
    ...connectAgentView(agent),
    agent_key: agentKey,
    sign_secret: signSecret,
    created: true,
    callback_secret: callbackSecret,
  };
}

export async function updateAgentPrompt(principal: HousePrincipal, agentId: string, raw: Record<string, unknown>) {
  await ensureAgentPromptColumn();
  const row = await findRealAgentById(principal.id, agentId.trim());
  if (!row?.sealedKey) throw new ProtocolError("not_found", "Unknown agent", 404);
  const patch: { systemPrompt?: string; courtLabel?: string; courtCap?: string } = {};
  if (raw.prompt !== undefined || raw.system_prompt !== undefined) {
    patch.systemPrompt = parseAgentPrompt(raw);
  }
  if (raw.court_label !== undefined) patch.courtLabel = parseCourtLabel(raw.court_label);
  if (raw.court_cap !== undefined) patch.courtCap = parseCourtCap(raw.court_cap);
  if (!Object.keys(patch).length) throw new ProtocolError("bad_request", "nothing to update", 400);
  await saveAgentConnect(row.id, principal.id, patch);
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
  courtLabel?: string | null;
  courtCap?: string | null;
  sealedSignSecret?: string | null;
  keyGen?: number | null;
  promptSha?: string | null;
}) {
  const prompt = agentPromptText(row.systemPrompt);
  const signSecret = row.sealedSignSecret ? unsealKey(row.sealedSignSecret) : "";
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    agent_key: row.sealedKey ? unsealKey(row.sealedKey) : "",
    sign_secret: signSecret,
    key_gen: row.keyGen ?? 1,
    prompt,
    prompt_lines: agentPromptLines(prompt),
    prompt_sha: row.promptSha || promptShaOf(row.systemPrompt),
    court_label: row.courtLabel ?? "",
    court_cap: row.courtCap ?? "",
    ...connectPublicFields(row),
  };
}

async function saveAgentConnect(
  agentId: string,
  principalId: string,
  patch: { systemPrompt?: string; courtLabel?: string; courtCap?: string },
) {
  const db = getDb();
  const next = {
    ...patch,
    ...(patch.systemPrompt !== undefined ? { promptSha: promptShaOf(patch.systemPrompt) } : {}),
  };
  await db
    .update(agents)
    .set(next)
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
    courtLabel?: string;
    courtCap?: string;
  },
) {
  const db = getDb();
  const id = mintToken("agt");
  const agentKey = mintToken("agk");
  const signSecret = mintSignSecret();
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
    courtLabel: input.courtLabel ?? "",
    courtCap: input.courtCap ?? "",
    sealedSignSecret: sealSignSecret(signSecret),
    keyGen: 1,
    promptSha: promptShaOf(input.systemPrompt),
  });
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new ProtocolError("internal", "Failed to create agent", 500);
  return { agent: row, agentKey, signSecret };
}

async function fillSignSecret(agentId: string) {
  await getDb()
    .update(agents)
    .set({ sealedSignSecret: sealSignSecret(mintSignSecret()) })
    .where(and(eq(agents.id, agentId), eq(agents.sealedSignSecret, "")));
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
