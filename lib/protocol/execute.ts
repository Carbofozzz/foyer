import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { KIND_REVERSIBLE, type ActionKind, type ActionPayload, type Outcome } from "./types";
import { ProtocolError } from "./errors";
import { actionPayload, loadActionBundle, type ActionRow } from "./bundle";
import { asPayload } from "./parse";
import { maybeReportTestPass } from "./report";

export async function executeSilenceAllow(action: ActionRow): Promise<void> {
  if (action.status === "permitted" || action.status === "executed") return;
  await grantPermit(action.id, actionPayload(action));
}

export async function executeAfterAck(actionId: string): Promise<void> {
  const bundle = await loadActionBundle(actionId);
  if (!bundle) return;
  if (bundle.action.status === "permitted" || bundle.action.status === "executed") return;
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

  if (chosen) {
    const kind = chosen.kind as ActionKind;
    if (!KIND_REVERSIBLE[kind] && bundle.action.appealUntil && bundle.action.appealUntil > new Date()) {
      return;
    }
  }

  await grantPermit(actionId, chosen);
}

async function grantPermit(actionId: string, payload: ActionPayload | null): Promise<void> {
  const db = getDb();
  await db
    .update(actions)
    .set({ status: "permitted", permittedPayload: payload })
    .where(eq(actions.id, actionId));
  await maybeReportTestPass(actionId);
}
