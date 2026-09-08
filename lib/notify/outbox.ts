import { and, eq, inArray } from "drizzle-orm";
import { actions, agents, decideTokens, notifications, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import { actionPayload, loadActionBundle } from "@/lib/protocol/bundle";
import { appealCase } from "@/lib/protocol/appeal";
import { ProtocolError } from "@/lib/protocol/errors";
import { hashSecret, mintToken } from "@/lib/protocol/keys";
import { notifyCopy, sendMail } from "./mail";
import { notifyReasonKey } from "./reasons";
import { sendTelegram } from "./telegram";

const DECIDE_MS = 7 * 24 * 60 * 60 * 1000;
const SEND_ATTEMPTS = 5;

type NotifyChannel = "email" | "telegram";

function decideOrigin(origin?: string): string {
  const raw = (origin || defaultPublicOrigin()).replace(/\/$/, "");
  if (/localhost|127\.0\.0\.1/i.test(raw)) return defaultPublicOrigin().replace(/\/$/, "");
  return raw;
}

function preferredChannel(principal: typeof principals.$inferSelect): NotifyChannel | null {
  if (principal.telegramChatId) return "telegram";
  if (principal.contactEmail && principal.emailVerifiedAt) return "email";
  return null;
}

export async function syncEscalateNotify(principalId: string, origin?: string): Promise<number> {
  const db = getDb();
  const [principal] = await db.select().from(principals).where(eq(principals.id, principalId)).limit(1);
  if (!principal || principal.isSpawn) return 0;

  const stale = await db
    .select({ id: notifications.id, actionStatus: actions.status, noteStatus: notifications.status })
    .from(notifications)
    .innerJoin(actions, eq(notifications.actionId, actions.id))
    .where(eq(actions.principalId, principalId));
  for (const row of stale) {
    if (row.actionStatus !== "escalated" && row.noteStatus === "pending") {
      await db
        .update(notifications)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(notifications.id, row.id));
    }
  }

  const channel = preferredChannel(principal);
  if (!channel) return 0;

  const escalated = await db
    .select({ id: actions.id })
    .from(actions)
    .where(and(eq(actions.principalId, principalId), eq(actions.status, "escalated")));

  let advanced = 0;
  for (const row of escalated) {
    const existing = await db.select().from(notifications).where(eq(notifications.actionId, row.id));
    if (existing.some((item) => item.status === "sent")) continue;
    for (const item of existing) {
      if (item.channel !== channel && item.status === "pending") {
        await db
          .update(notifications)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(notifications.id, item.id));
      }
    }
    await db
      .insert(notifications)
      .values({
        id: mintToken("ntf"),
        actionId: row.id,
        channel,
        status: "pending",
      })
      .onConflictDoNothing({ target: [notifications.actionId, notifications.channel] });
    const sent = await deliverOne(row.id, principal, origin, channel);
    if (sent) advanced += 1;
  }
  return advanced;
}

/** @deprecated name kept for sweep call sites */
export const syncEscalateMail = syncEscalateNotify;

async function deliverOne(
  actionId: string,
  principal: typeof principals.$inferSelect,
  origin: string | undefined,
  channel: NotifyChannel,
): Promise<boolean> {
  const db = getDb();
  const [note] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.actionId, actionId), eq(notifications.channel, channel)))
    .limit(1);
  if (!note || note.status === "sent" || note.status === "cancelled") return false;
  if (note.attempts >= SEND_ATTEMPTS) {
    await db.update(notifications).set({ status: "failed", updatedAt: new Date() }).where(eq(notifications.id, note.id));
    return false;
  }

  const bundle = await loadActionBundle(actionId);
  if (!bundle || bundle.action.status !== "escalated") {
    await db.update(notifications).set({ status: "cancelled", updatedAt: new Date() }).where(eq(notifications.id, note.id));
    return false;
  }

  const [claimed] = await db
    .update(notifications)
    .set({ attempts: note.attempts + 1, updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, note.id),
        inArray(notifications.status, ["pending", "failed"]),
        eq(notifications.attempts, note.attempts),
      ),
    )
    .returning({ id: notifications.id });
  if (!claimed) return false;

  const raw = mintToken("dcd");
  await db.insert(decideTokens).values({
    tokenHash: hashSecret(raw),
    actionId,
    expiresAt: new Date(Date.now() + DECIDE_MS),
  });
  const locale = isLocale(principal.contactLocale) ? principal.contactLocale : "en";
  const t = notifyCopy(locale);
  const [proposer] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, bundle.action.proposerId)).limit(1);
  const payload = actionPayload(bundle.action);
  const reason = notifyReasonKey(bundle.verdict?.reasoning ?? "", bundle.verdict?.judge ?? "offline");
  const reasonLine = t[reason];
  const amount =
    typeof payload.amount === "number"
      ? `${payload.amount}${payload.currency ? ` ${payload.currency}` : ""}`
      : "";
  const base = decideOrigin(origin);
  const url = `${base}/${locale}/decide/${raw}`;
  const text = [
    t.decideLead,
    reasonLine,
    `${t.who}: ${proposer?.name ?? bundle.action.proposerId}`,
    `${t.what}: ${payload.summary}`,
    amount ? `${t.amount}: ${amount}` : "",
    t.ask,
    url,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (channel === "telegram") {
      if (!principal.telegramChatId) throw new Error("telegram is not linked");
      await sendTelegram(principal.telegramChatId, text);
    } else {
      await sendMail({ to: principal.contactEmail!, subject: t.decideSubject, text });
    }
    await db
      .update(notifications)
      .set({ status: "sent", error: null, updatedAt: new Date() })
      .where(eq(notifications.id, note.id));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "send failed";
    const attempts = note.attempts + 1;
    await db
      .update(notifications)
      .set({
        status: attempts >= SEND_ATTEMPTS ? "failed" : "pending",
        error: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(notifications.id, note.id));
    return false;
  }
}

export async function loadDecideView(raw: string) {
  const db = getDb();
  const [token] = await db.select().from(decideTokens).where(eq(decideTokens.tokenHash, hashSecret(raw))).limit(1);
  if (!token) throw new ProtocolError("not_found", "Unknown link", 404);
  if (token.usedAt || token.expiresAt.getTime() <= Date.now()) {
    throw new ProtocolError("gone", "This link is no longer valid", 410);
  }
  const bundle = await loadActionBundle(token.actionId);
  if (!bundle || bundle.action.status !== "escalated" || !bundle.courtCase) {
    throw new ProtocolError("gone", "This request is already decided", 410);
  }
  const [proposer] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, bundle.action.proposerId)).limit(1);
  const payload = actionPayload(bundle.action);
  return {
    token: raw,
    case_id: bundle.courtCase.id,
    who: proposer?.name ?? bundle.action.proposerId,
    summary: payload.summary,
    amount: typeof payload.amount === "number" ? payload.amount : null,
    currency: typeof payload.currency === "string" ? payload.currency : null,
    reason: notifyReasonKey(bundle.verdict?.reasoning ?? "", bundle.verdict?.judge ?? "offline"),
  };
}

export async function decideFromToken(raw: string, outcome: unknown, now: Date) {
  const db = getDb();
  const [token] = await db.select().from(decideTokens).where(eq(decideTokens.tokenHash, hashSecret(raw))).limit(1);
  if (!token) throw new ProtocolError("not_found", "Unknown link", 404);
  if (token.usedAt || token.expiresAt.getTime() <= Date.now()) {
    throw new ProtocolError("gone", "This link is no longer valid", 410);
  }
  const bundle = await loadActionBundle(token.actionId);
  if (!bundle || !bundle.courtCase) throw new ProtocolError("gone", "This request is already decided", 410);
  const [principal] = await db.select().from(principals).where(eq(principals.id, bundle.action.principalId)).limit(1);
  if (!principal) throw new ProtocolError("not_found", "Unknown house", 404);
  const result = await appealCase(principal, bundle.courtCase.id, { outcome }, now);
  await db.update(decideTokens).set({ usedAt: now }).where(eq(decideTokens.tokenHash, token.tokenHash));
  await db
    .update(notifications)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(notifications.actionId, token.actionId), eq(notifications.status, "pending")));
  return result;
}
