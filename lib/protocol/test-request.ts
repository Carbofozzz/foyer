import { eq } from "drizzle-orm";
import { actions, agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ackAction, fileObjection, proposeAction } from "./actions";
import { lockedKinds, type HousePrincipal } from "./bundle";
import { ProtocolError } from "./errors";
import { ensureTestAgent } from "./house-clients";
import { isRecord } from "./parse";
import { maybeReportTestPass } from "./report";
import { sweep } from "./sweep";
import { TEST_CAST } from "./test-cast";
import type { ActionKind, ActionPayload } from "./types";

export { TEST_CAST } from "./test-cast";

export type TestPath = "pass" | "court";

export function parseTestRequest(body: unknown) {
  if (!isRecord(body)) throw new ProtocolError("bad_request", "JSON body required", 400);
  const proposer = findCast(body.proposer);
  const objector = findCast(body.objector);
  if (proposer.role === objector.role) {
    throw new ProtocolError("bad_request", "Pick two different test assistants", 400);
  }
  const kind = parseKind(body.kind);
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) throw new ProtocolError("bad_request", "summary is required", 400);
  const path = body.path === "court" ? "court" : body.path === "pass" ? "pass" : null;
  if (!path) throw new ProtocolError("bad_request", "path must be pass or court", 400);
  const reply = typeof body.reply === "string" ? body.reply.trim() : "";
  if (path === "court" && !reply) throw new ProtocolError("bad_request", "reply is required for court", 400);
  return { proposer, objector, kind, summary, reply, path };
}

export async function runTestRequest(principal: HousePrincipal, body: unknown) {
  const draft = parseTestRequest(body);
  const allowed = lockedKinds(principal);
  if (draft.kind !== "cancel" && !allowed.includes(draft.kind)) {
    throw new ProtocolError("forbidden", "This kind is not locked through the gateway", 403);
  }

  const proposer = await ensureTestAgent(principal.id, draft.proposer);
  const objector = await ensureTestAgent(principal.id, draft.objector);
  const now = new Date();
  const payload: ActionPayload = { kind: draft.kind, summary: draft.summary };

  const proposed = await proposeAction(
    { agent: proposer, principal },
    {
      kind: draft.kind,
      payload,
      justification: draft.summary,
      evidence: [],
    },
    now,
  );
  await getDb().update(actions).set({ testPass: true }).where(eq(actions.id, proposed.id));

  if (draft.path === "court") {
    await fileObjection(
      { agent: objector, principal },
      proposed.id,
      {
        justification: draft.reply,
        evidence: [],
        counter_action: { kind: draft.kind, summary: draft.reply },
      },
      now,
    );
    // Both sides already spoke. Do not wait the silence window for a third voice.
    await getDb().update(actions).set({ silenceUntil: now }).where(eq(actions.id, proposed.id));
  }

  const closeAt = draft.path === "court" ? now : new Date(new Date(proposed.silence_until).getTime() + 1000);
  await sweep(principal.id, closeAt, { courts: 0 });

  if (draft.path === "pass") {
    await ackIfEngaged(principal, proposer.id, proposed.id);
    await maybeReportTestPass(proposed.id);
  } else {
    await ackIfEngaged(principal, proposer.id, proposed.id);
    await ackIfEngaged(principal, objector.id, proposed.id);
  }

  await getDb()
    .update(principals)
    .set({ testClients: true, wizardHarnessDone: true })
    .where(eq(principals.id, principal.id));

  return { action_id: proposed.id, path: draft.path };
}

function findCast(value: unknown) {
  if (typeof value !== "string") throw new ProtocolError("bad_request", "Unknown test assistant", 400);
  const row = TEST_CAST.find((item) => item.role === value);
  if (!row) throw new ProtocolError("bad_request", "Unknown test assistant", 400);
  return row;
}

function parseKind(value: unknown): ActionKind {
  if (value === "spend" || value === "book" || value === "message" || value === "cancel") return value;
  throw new ProtocolError("bad_request", "kind must be spend, book, message, or cancel", 400);
}

async function ackIfEngaged(principal: HousePrincipal, agentId: string, actionId: string) {
  const [agent] = await getDb().select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return;
  try {
    await ackAction({ agent, principal }, actionId);
  } catch {
    // Silence-allow has no ack; court has not judged yet.
  }
}
