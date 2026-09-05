import { eq } from "drizzle-orm";
import { adapterOf, apply } from "@/lib/adapters";
import { actions, executions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "./keys";
import type { ActionKind, ActionPayload, Outcome } from "./types";
import { ProtocolError } from "./errors";
import { actionPayload, loadActionBundle, type ActionRow } from "./bundle";
import { asPayload } from "./parse";

export async function executeSilenceAllow(action: ActionRow): Promise<void> {
  await writeExecution(action, action.kind as ActionKind, actionPayload(action));
}

export async function executeAfterAck(actionId: string): Promise<void> {
  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.executedAt) return;
  if (bundle.action.status === "escalated") return;

  const verdict = bundle.verdict;
  if (!verdict) return;

  const outcome = verdict.outcome as Outcome;
  if (outcome === "escalate") {
    const db = getDb();
    await db.update(actions).set({ status: "escalated" }).where(eq(actions.id, actionId));
    return;
  }

  let chosen: ActionPayload | null = null;
  if (outcome === "allow_a") {
    chosen = actionPayload(bundle.action);
  } else if (outcome === "allow_b") {
    const first = bundle.objections[0];
    chosen = first?.counterAction ? asPayload(first.counterAction) : null;
  } else if (outcome === "remedy") {
    if (!verdict.remedyAction) {
      throw new ProtocolError("internal", "remedy without remedy_action", 500);
    }
    chosen = asPayload(verdict.remedyAction);
  }

  if (!chosen) {
    const db = getDb();
    await db
      .update(actions)
      .set({ status: "executed", executedAt: new Date() })
      .where(eq(actions.id, actionId));
    return;
  }

  if (!adapterOf(chosen.kind).reversible && bundle.action.appealUntil && bundle.action.appealUntil > new Date()) {
    return;
  }

  await writeExecution(bundle.action, chosen.kind, chosen);
}

async function writeExecution(action: ActionRow, kind: ActionKind, payload: ActionPayload): Promise<void> {
  if (action.executedAt) return;
  const db = getDb();
  const existing = await db.select().from(executions).where(eq(executions.actionId, action.id)).limit(1);
  if (existing.length > 0) {
    await db
      .update(actions)
      .set({ status: "executed", executedAt: existing[0].createdAt })
      .where(eq(actions.id, action.id));
    return;
  }
  const result = await apply(kind, payload, {
    principalId: action.principalId,
    actionId: action.id,
  });
  await db.insert(executions).values({
    id: mintToken("exe"),
    actionId: action.id,
    kind,
    result,
  });
  await db
    .update(actions)
    .set({ status: "executed", executedAt: new Date() })
    .where(eq(actions.id, action.id));
}
