import { and, eq, gt, sql } from "drizzle-orm";
import { emailConfirmTokens, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { ProtocolError } from "@/lib/protocol/errors";
import { hashSecret, mintToken } from "@/lib/protocol/keys";
import { isOrgHouse } from "@/lib/protocol/types";
import { parseWaitlistEmail } from "@/lib/protocol/waitlist";
import { notifyCopy, sendMail } from "./mail";
import { mintTelegramStartUrl, drainTelegramUpdates, telegramConfigured } from "./telegram";
import { listHouseContacts, listHouseDesks, confirmContactEmail } from "./house-contacts";

const CONFIRM_MS = 48 * 60 * 60 * 1000;

export function parseContactEmail(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new ProtocolError("bad_request", "email must be a string", 400);
  if (!raw.trim()) return null;
  return parseWaitlistEmail(raw);
}

export async function saveHouseEmail(
  principal: HousePrincipal,
  raw: unknown,
  locale: string,
  origin?: string,
): Promise<{ email: string | null; confirmQueued: boolean }> {
  const email = parseContactEmail(raw);
  const loc = isLocale(locale) ? locale : "en";
  const db = getDb();
  if (!email) {
    await db
      .update(principals)
      .set({ contactEmail: null, emailVerifiedAt: null, contactLocale: loc })
      .where(eq(principals.id, principal.id));
    return { email: null, confirmQueued: false };
  }
  const same = principal.contactEmail?.toLowerCase() === email && principal.emailVerifiedAt;
  await db
    .update(principals)
    .set({
      contactEmail: email,
      contactLocale: loc,
      ...(same ? {} : { emailVerifiedAt: null }),
    })
    .where(eq(principals.id, principal.id));
  if (same) return { email, confirmQueued: false };
  await queueConfirmEmail({ ...principal, contactEmail: email, contactLocale: loc }, origin);
  return { email, confirmQueued: true };
}

export async function queueConfirmEmail(principal: HousePrincipal, origin?: string): Promise<void> {
  const email = principal.contactEmail?.trim();
  if (!email) return;
  const raw = mintToken("emc");
  const db = getDb();
  await db.delete(emailConfirmTokens).where(
    and(eq(emailConfirmTokens.principalId, principal.id), sql`${emailConfirmTokens.contactId} is null`),
  );
  await db.insert(emailConfirmTokens).values({
    tokenHash: hashSecret(raw),
    principalId: principal.id,
    email,
    expiresAt: new Date(Date.now() + CONFIRM_MS),
  });
  const base = (origin || defaultPublicOrigin()).replace(/\/$/, "");
  const locale = isLocale(principal.contactLocale) ? principal.contactLocale : "en";
  const t = notifyCopy(locale);
  const url = `${base}/${locale}/confirm-email/${raw}`;
  try {
    await sendMail({
      to: email,
      subject: t.confirmSubject,
      text: `${t.confirmBody}\n\n${url}`,
    });
  } catch {
    // Token is stored; Contacts can resend.
  }
}

export async function confirmEmailToken(raw: string): Promise<{ ok: boolean }> {
  const { ensureHouseContactsSchema } = await import("./house-contacts");
  await ensureHouseContactsSchema();
  const tokenHash = hashSecret(raw);
  const db = getDb();
  const [row] = await db
    .select()
    .from(emailConfirmTokens)
    .where(and(eq(emailConfirmTokens.tokenHash, tokenHash), gt(emailConfirmTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown or expired link", 404);
  if (row.contactId) {
    await confirmContactEmail(row.contactId, row.email);
    await db.delete(emailConfirmTokens).where(eq(emailConfirmTokens.contactId, row.contactId));
    return { ok: true };
  }
  await db
    .update(principals)
    .set({
      contactEmail: row.email,
      emailVerifiedAt: new Date(),
    })
    .where(eq(principals.id, row.principalId));
  await db.delete(emailConfirmTokens).where(
    and(eq(emailConfirmTokens.principalId, row.principalId), sql`${emailConfirmTokens.contactId} is null`),
  );
  return { ok: true };
}

export function contactsView(principal: HousePrincipal) {
  return {
    email: principal.contactEmail,
    email_verified: Boolean(principal.emailVerifiedAt),
    telegram: Boolean(principal.telegramChatId),
    telegram_handle: principal.telegramHandle,
  };
}

export async function contactsPayload(principal: HousePrincipal, opts?: { drain?: boolean }) {
  if (opts?.drain !== false) await drainTelegramUpdates();
  const [fresh] = await getDb().select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  const row = fresh ?? principal;
  const view = contactsView(row);
  const configured = telegramConfigured();
  let telegram_url: string | null = null;
  if (!isOrgHouse(row) && !view.telegram && configured) {
    telegram_url = await mintTelegramStartUrl(row);
  }
  return {
    ...view,
    telegram_configured: configured,
    telegram_url,
    targets: isOrgHouse(row) ? await listHouseContacts(row.id) : [],
    desks: isOrgHouse(row) ? await listHouseDesks(row.id) : [],
  };
}
