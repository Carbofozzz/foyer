import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agents, writeSigs } from "@/lib/db/schema";
import { promptShaOf } from "@/lib/mcp/config";
import { ProtocolError } from "./errors";
import { mintToken } from "./keys";
import { sealKey, unsealKey } from "./seal";
import type { HouseAuth } from "./bundle";

const SKEW_MS = 120_000;

export type WriteSignOffer = {
  issuedAt?: string;
  sig?: string;
  signSecret?: string;
  promptSha?: string;
};

export type WriteSignProof = {
  signed: boolean;
  sig: string;
  issuedAt: Date | null;
  keyGen: number;
};

export type SignMessage = {
  op: string;
  agent_id: string;
  issued_at: string;
  action_id?: string;
  revision?: number;
  payload?: unknown;
  justification?: string;
  evidence?: unknown;
  counter_action?: unknown;
  prompt_sha?: string;
};

let ready = false;

export async function ensureWriteSignColumns() {
  if (ready) return;
  const db = getDb();
  await db.execute(
    sql`ALTER TABLE principals ADD COLUMN IF NOT EXISTS require_signed_writes boolean NOT NULL DEFAULT false`,
  );
  await db.execute(sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS sealed_sign_secret text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS key_gen integer NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS prompt_sha text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_write_signed boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_write_sig text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_write_issued_at timestamptz`);
  await db.execute(sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_write_key_gen integer NOT NULL DEFAULT 0`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS write_sigs (
      agent_id text NOT NULL,
      sig text NOT NULL,
      PRIMARY KEY (agent_id, sig)
    )
  `);
  ready = true;
}

export function mintSignSecret(): string {
  return mintToken("sgn");
}

export function sealSignSecret(plain: string): string {
  return sealKey(plain);
}

export function writeSignFrom(request: Request | undefined, body?: Record<string, unknown>): WriteSignOffer {
  const issuedAt =
    header(request, "x-foyer-issued-at") ||
    (typeof body?.issued_at === "string" ? body.issued_at : undefined);
  const sig =
    header(request, "x-foyer-signature") || (typeof body?.sig === "string" ? body.sig : undefined);
  const signSecret =
    header(request, "x-foyer-sign-secret") ||
    (typeof body?.sign_secret === "string" ? body.sign_secret : undefined);
  const promptSha =
    header(request, "x-foyer-prompt-sha") ||
    (typeof body?.prompt_sha === "string" ? body.prompt_sha : undefined);
  return { issuedAt, sig, signSecret, promptSha };
}

export async function verifyWriteSign(
  auth: HouseAuth,
  message: Omit<SignMessage, "agent_id" | "issued_at">,
  offer: WriteSignOffer,
  options?: { skip?: boolean },
): Promise<WriteSignProof> {
  await ensureWriteSignColumns();
  const required = Boolean(auth.principal.requireSignedWrites);
  const keyGen = auth.agent.keyGen ?? 1;
  if (options?.skip) {
    return { signed: false, sig: "", issuedAt: null, keyGen };
  }
  await assertPromptPin(auth, offer, required);
  const pin = offer.promptSha?.trim().toLowerCase() || undefined;
  const sealed = auth.agent.sealedSignSecret ?? "";
  if (!sealed) {
    if (required) throw new ProtocolError("unauthorized", "Signed write required", 401);
    return { signed: false, sig: "", issuedAt: null, keyGen };
  }
  const secret = unsealKey(sealed);
  const headerSecret = offer.signSecret?.trim() ?? "";
  if (headerSecret) {
    if (!sameSecret(secret, headerSecret)) {
      throw new ProtocolError("unauthorized", "Bad sign secret", 401);
    }
    const issuedAt = new Date();
    const issuedIso = issuedAt.toISOString();
    const sig = hmacSign(secret, {
      ...message,
      agent_id: auth.agent.id,
      issued_at: issuedIso,
      ...(pin ? { prompt_sha: pin } : {}),
    });
    await rememberSig(auth.agent.id, sig);
    return { signed: true, sig, issuedAt, keyGen };
  }
  const issuedRaw = offer.issuedAt?.trim() ?? "";
  const sigRaw = offer.sig?.trim().toLowerCase() ?? "";
  if (!issuedRaw && !sigRaw) {
    if (required) throw new ProtocolError("unauthorized", "Signed write required", 401);
    return { signed: false, sig: "", issuedAt: null, keyGen };
  }
  if (!issuedRaw || !/^[0-9a-f]{64}$/.test(sigRaw)) {
    throw new ProtocolError("unauthorized", "issued_at and sig required", 401);
  }
  const issuedAt = new Date(issuedRaw);
  if (Number.isNaN(issuedAt.getTime()) || Math.abs(Date.now() - issuedAt.getTime()) > SKEW_MS) {
    throw new ProtocolError("unauthorized", "issued_at is stale", 401);
  }
  const expected = hmacSign(secret, {
    ...message,
    agent_id: auth.agent.id,
    issued_at: issuedRaw,
    ...(pin ? { prompt_sha: pin } : {}),
  });
  if (!sameHex(expected, sigRaw)) {
    throw new ProtocolError("unauthorized", "Bad signature", 401);
  }
  await rememberSig(auth.agent.id, sigRaw);
  return { signed: true, sig: sigRaw, issuedAt, keyGen };
}

function hmacSign(secret: string, message: SignMessage): string {
  const body: Record<string, unknown> = {
    agent_id: message.agent_id,
    issued_at: message.issued_at,
    op: message.op,
  };
  if (message.action_id) body.action_id = message.action_id;
  if (message.revision != null) body.revision = message.revision;
  if (message.payload !== undefined) body.payload = message.payload;
  if (message.justification !== undefined) body.justification = message.justification;
  if (message.evidence !== undefined) body.evidence = message.evidence;
  if (message.counter_action !== undefined) body.counter_action = message.counter_action;
  if (message.prompt_sha) body.prompt_sha = message.prompt_sha;
  const canonical = JSON.stringify(sortValue(body));
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = sortValue(obj[key]);
  return out;
}

async function assertPromptPin(auth: HouseAuth, offer: WriteSignOffer, required: boolean) {
  let stored = auth.agent.promptSha?.trim() ?? "";
  if (!stored) {
    stored = promptShaOf(auth.agent.systemPrompt);
    await getDb().update(agents).set({ promptSha: stored }).where(eq(agents.id, auth.agent.id));
    auth.agent.promptSha = stored;
  }
  const claim = offer.promptSha?.trim().toLowerCase() ?? "";
  if (!claim) {
    if (required) throw new ProtocolError("conflict", "Prompt pin required; refresh Connect", 409);
    return;
  }
  if (!/^[0-9a-f]{64}$/.test(claim) || !sameHex(stored, claim)) {
    throw new ProtocolError("conflict", "Prompt moved; refresh Connect", 409);
  }
}

export function writeSignStamp(proof: WriteSignProof) {
  return {
    lastWriteSigned: proof.signed,
    lastWriteSig: proof.sig,
    lastWriteIssuedAt: proof.issuedAt,
    lastWriteKeyGen: proof.keyGen,
  };
}

async function rememberSig(agentId: string, sig: string) {
  const rows = await getDb()
    .insert(writeSigs)
    .values({ agentId, sig })
    .onConflictDoNothing()
    .returning({ sig: writeSigs.sig });
  if (rows.length === 0) {
    throw new ProtocolError("conflict", "Replay of a signed write", 409);
  }
}

function header(request: Request | undefined, name: string): string | undefined {
  const raw = request?.headers.get(name)?.trim();
  return raw || undefined;
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sameHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function parseRequireSigned(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new ProtocolError("bad_request", "require_signed_writes must be a boolean", 400);
}
