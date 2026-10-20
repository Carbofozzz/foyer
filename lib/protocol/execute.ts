import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { ActionPayload } from "./types";
import { REPORT_ACK_SEC } from "./types";
import { actionPayload, loadActionBundle, type ActionRow } from "./bundle";
import { payloadForOutcome } from "./verdict";
import { mintGrantForPermit } from "@/lib/lock/grants";

export async function executeSilenceAllow(action: ActionRow): Promise<void> {
  if (action.status === "permitted" || action.status === "executed") return;
  await grantPermit(action.id, actionPayload(action), "silence");
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

  const decision = verdict.judge === "offline" ? "human" : "court";
  await grantPermit(actionId, chosen, decision);
}

async function grantPermit(
  actionId: string,
  payload: ActionPayload | null,
  decision: "silence" | "court" | "human",
): Promise<void> {
  const db = getDb();
  await db
    .update(actions)
    .set({
      status: "permitted",
      permittedPayload: payload,
      ackUntil: new Date(Date.now() + REPORT_ACK_SEC * 1000),
    })
    .where(eq(actions.id, actionId));
  if (!payload) return;
  const [row] = await db.select().from(actions).where(eq(actions.id, actionId)).limit(1);
  if (row) await mintGrantForPermit(row, decision);
}
