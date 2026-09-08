import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { ActionPayload } from "./types";
import { REPORT_ACK_SEC } from "./types";
import { actionPayload, loadActionBundle, type ActionRow } from "./bundle";
import { payloadForOutcome } from "./verdict";

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

  const chosen = payloadForOutcome(verdict.outcome, actionPayload(bundle.action));
  if (chosen === "escalate") {
    const db = getDb();
    await db.update(actions).set({ status: "escalated" }).where(eq(actions.id, actionId));
    return;
  }

  await grantPermit(actionId, chosen);
}

async function grantPermit(actionId: string, payload: ActionPayload | null): Promise<void> {
  const db = getDb();
  await db
    .update(actions)
    .set({
      status: "permitted",
      permittedPayload: payload,
      ackUntil: new Date(Date.now() + REPORT_ACK_SEC * 1000),
    })
    .where(eq(actions.id, actionId));
}
