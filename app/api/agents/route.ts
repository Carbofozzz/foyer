import { and, eq, isNull } from "drizzle-orm";
import { agents, enrollments } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { jsonError, jsonOk, bearerToken } from "@/lib/protocol/http";
import { hashSecret, mintToken } from "@/lib/protocol/keys";
import { requireAgent } from "@/lib/protocol/auth";
import { sweep } from "@/lib/protocol/sweep";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";
import { isRecord, parseAgentWake } from "@/lib/protocol/parse";
import { ProtocolError } from "@/lib/protocol/errors";
import { sealKey } from "@/lib/protocol/seal";
import { connectPublicFields } from "@/lib/protocol/house-clients";

export async function GET(request: Request) {
  const auth = await requireAgent(request);
  if ("error" in auth) return auth.error;
  await sweep(auth.principal.id, new Date());
  const db = getDb();
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.principalId, auth.principal.id), eq(agents.isGuardian, false)));
  return jsonOk(
    rows.map((row) => ({
      id: row.id,
      role: row.role,
      name: row.name,
      ...connectPublicFields(row),
    })),
  );
}

export async function POST(request: Request) {
  return guardPublicWrite(request, "enroll", LIMITS.enroll, () => postEnroll(request));
}

async function postEnroll(request: Request) {
  const enrollment = bearerToken(request);
  if (!enrollment || !enrollment.startsWith("enr_")) {
    return jsonError("unauthorized", "Enrollment token required", 401);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    body = isRecord(raw) ? raw : {};
  } catch {
    body = {};
  }

  const db = getDb();
  const [slot] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.tokenHash, hashSecret(enrollment)), isNull(enrollments.usedAt)))
    .limit(1);

  if (!slot || slot.expiresAt < new Date()) {
    return jsonError("not_found", "Unknown house", 404);
  }

  let spec;
  try {
    spec = parseAgentWake(body);
  } catch (error) {
    if (error instanceof ProtocolError) {
      return jsonError(error.code, error.message, error.status);
    }
    throw error;
  }
  const callbackSecret =
    spec.wake === "callback" ? spec.callbackSecret || mintToken("whk") : null;

  const agentId = mintToken("agt");
  const agentKey = mintToken("agk");
  await db.insert(agents).values({
    id: agentId,
    principalId: slot.principalId,
    role: slot.role,
    name: (typeof body.name === "string" && body.name.trim()) || slot.name,
    keyHash: hashSecret(agentKey),
    wake: spec.wake,
    callbackUrl: spec.callbackUrl,
    sealedCallbackSecret: callbackSecret ? sealKey(callbackSecret) : null,
  });
  await db.update(enrollments).set({ usedAt: new Date() }).where(eq(enrollments.tokenHash, slot.tokenHash));

  const name = (typeof body.name === "string" && body.name.trim()) || slot.name;
  return jsonOk(
    {
      id: agentId,
      role: slot.role,
      name,
      agent_key: agentKey,
      ...connectPublicFields({
        wake: spec.wake,
        callbackUrl: spec.callbackUrl,
        sealedCallbackSecret: callbackSecret ? "set" : null,
      }),
      callback_secret: callbackSecret,
    },
    201,
  );
}
