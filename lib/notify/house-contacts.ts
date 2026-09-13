import { and, eq, inArray, sql } from "drizzle-orm";
import { agents, emailConfirmTokens, houseContactPolicies, houseContacts, telegramLinkTokens } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { ProtocolError } from "@/lib/protocol/errors";
import { hashSecret, mintToken } from "@/lib/protocol/keys";
import { parseWaitlistEmail } from "@/lib/protocol/waitlist";
import { isNotifyReason, NOTIFY_REASON_KEYS, type NotifyReasonKey } from "./reasons";
import { notifyCopy, sendMail } from "./mail";
import { mintTelegramStartUrl, telegramConfigured } from "./telegram";

const CONFIRM_MS = 48 * 60 * 60 * 1000;
export const HOUSE_CONTACT_CAP = 16;

export type ContactPolicyKind = "all" | "points" | "objector";

let schemaReady = false;

export async function ensureHouseContactsSchema() {
  if (schemaReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS house_contacts (
      id text PRIMARY KEY,
      principal_id text NOT NULL REFERENCES principals(id),
      label text NOT NULL DEFAULT '',
      email text,
      email_verified_at timestamptz,
      telegram_chat_id text,
      telegram_handle text,
      telegram_linked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE house_contacts ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT ''`);
  try {
    await db.execute(sql`ALTER TABLE house_contacts ALTER COLUMN covers_all SET DEFAULT true`);
    await db.execute(sql`ALTER TABLE house_contacts ALTER COLUMN agent_ids SET DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE house_contacts DROP COLUMN IF EXISTS covers_all`);
    await db.execute(sql`ALTER TABLE house_contacts DROP COLUMN IF EXISTS agent_ids`);
  } catch {
    // Leftover coverage columns do not block listing people.
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS house_contact_policies (
      id text PRIMARY KEY,
      contact_id text NOT NULL UNIQUE REFERENCES house_contacts(id),
      kind text NOT NULL,
      reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
      objector_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS house_contacts_principal ON house_contacts (principal_id)`);
  try {
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS house_contacts_email_org
      ON house_contacts (principal_id, lower(email))
      WHERE email IS NOT NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS house_contacts_telegram_org
      ON house_contacts (principal_id, telegram_chat_id)
      WHERE telegram_chat_id IS NOT NULL
    `);
  } catch {
    // Existing duplicate rows keep the app-level check.
  }
  await db.execute(sql`ALTER TABLE email_confirm_tokens ADD COLUMN IF NOT EXISTS contact_id text`);
  await db.execute(sql`ALTER TABLE telegram_link_tokens ADD COLUMN IF NOT EXISTS contact_id text`);
  schemaReady = true;
}

export type HouseContactPolicyView = {
  kind: ContactPolicyKind;
  reasons: NotifyReasonKey[];
  objector_id: string | null;
};

export type HouseContactView = {
  id: string;
  label: string;
  email: string | null;
  email_verified: boolean;
  telegram: boolean;
  telegram_handle: string | null;
  telegram_url: string | null;
  policy: HouseContactPolicyView | null;
};

export type HouseDesk = { id: string; name: string };

function isPolicyKind(raw: unknown): raw is ContactPolicyKind {
  return raw === "all" || raw === "points" || raw === "objector";
}

function parseLabel(raw: unknown, required: boolean): string {
  if (raw == null || raw === "") {
    if (required) throw new ProtocolError("bad_request", "Name this person", 400);
    return "";
  }
  if (typeof raw !== "string") throw new ProtocolError("bad_request", "label must be a string", 400);
  const label = raw.trim().slice(0, 80);
  if (required && !label) throw new ProtocolError("bad_request", "Name this person", 400);
  return label;
}

function parseReasons(raw: unknown): NotifyReasonKey[] {
  if (!Array.isArray(raw)) throw new ProtocolError("bad_request", "Pick at least one escalate point", 400);
  const reasons = [...new Set(raw.filter(isNotifyReason))];
  if (reasons.length === 0) throw new ProtocolError("bad_request", "Pick at least one escalate point", 400);
  return reasons;
}

async function houseDeskIds(principalId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.isGuardian, false)));
  return new Set(rows.map((row) => row.id));
}

export async function listHouseDesks(principalId: string): Promise<HouseDesk[]> {
  const rows = await getDb()
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(and(eq(agents.principalId, principalId), eq(agents.isGuardian, false)));
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

function asPolicyView(row: typeof houseContactPolicies.$inferSelect | undefined): HouseContactPolicyView | null {
  if (!row || !isPolicyKind(row.kind)) return null;
  const reasons = (Array.isArray(row.reasons) ? row.reasons : []).filter(isNotifyReason);
  return { kind: row.kind, reasons, objector_id: row.objectorId };
}

export async function listHouseContacts(principalId: string): Promise<HouseContactView[]> {
  await ensureHouseContactsSchema();
  const db = getDb();
  const rows = await db.select().from(houseContacts).where(eq(houseContacts.principalId, principalId));
  let policies: (typeof houseContactPolicies.$inferSelect)[] = [];
  if (rows.length > 0) {
    try {
      policies = await db
        .select()
        .from(houseContactPolicies)
        .where(
          inArray(
            houseContactPolicies.contactId,
            rows.map((row) => row.id),
          ),
        );
    } catch {
      policies = [];
    }
  }
  const byContact = new Map(policies.map((row) => [row.contactId, row]));
  const configured = telegramConfigured();
  const out: HouseContactView[] = [];
  for (const row of rows) {
    let telegram_url: string | null = null;
    if (!row.telegramChatId && configured) {
      telegram_url = await mintTelegramStartUrl({ id: principalId } as HousePrincipal, row.id);
    }
    out.push({
      id: row.id,
      label: row.label?.trim() ?? "",
      email: row.email,
      email_verified: Boolean(row.emailVerifiedAt),
      telegram: Boolean(row.telegramChatId),
      telegram_handle: row.telegramHandle,
      telegram_url,
      policy: asPolicyView(byContact.get(row.id)),
    });
  }
  return out;
}

function reachable(row: typeof houseContacts.$inferSelect) {
  return Boolean(row.telegramChatId || (row.email && row.emailVerifiedAt));
}

export async function assertUniqueHouseContact(
  principalId: string,
  input: { exceptId?: string; email?: string | null; telegramChatId?: string | null },
) {
  const email = input.email?.trim().toLowerCase() || null;
  const chat = input.telegramChatId?.trim() || null;
  if (!email && !chat) return;
  const rows = await getDb()
    .select()
    .from(houseContacts)
    .where(eq(houseContacts.principalId, principalId));
  for (const row of rows) {
    if (input.exceptId && row.id === input.exceptId) continue;
    if (email && row.email?.trim().toLowerCase() === email) {
      throw new ProtocolError("duplicate_email", "That email is already on another person in this house", 409);
    }
    if (chat && row.telegramChatId === chat) {
      throw new ProtocolError("duplicate_telegram", "That Telegram is already on another person in this house", 409);
    }
  }
}

function policyMatches(
  policy: HouseContactPolicyView,
  reason: NotifyReasonKey,
  objectorIds: string[],
): boolean {
  if (policy.kind === "all") return true;
  if (!policy.reasons.includes(reason)) return false;
  if (policy.kind === "points") return true;
  return Boolean(policy.objector_id && objectorIds.includes(policy.objector_id));
}

export async function matchReachableHouseContacts(
  principalId: string,
  reason: NotifyReasonKey,
  objectorIds: string[],
) {
  await ensureHouseContactsSchema();
  const db = getDb();
  const rows = await db.select().from(houseContacts).where(eq(houseContacts.principalId, principalId));
  const views = await listHouseContacts(principalId);
  const byId = new Map(views.map((row) => [row.id, row]));
  return rows.filter((row) => {
    if (!reachable(row)) return false;
    const policy = byId.get(row.id)?.policy;
    return Boolean(policy && policyMatches(policy, reason, objectorIds));
  });
}

export async function addHouseContact(
  principal: HousePrincipal,
  input: { label?: unknown; email?: unknown },
  origin?: string,
): Promise<HouseContactView[]> {
  if (principal.type !== "org") throw new ProtocolError("forbidden", "Only a company house has a contact list", 403);
  await ensureHouseContactsSchema();
  const label = parseLabel(input.label, true);
  const db = getDb();
  const existing = await db.select().from(houseContacts).where(eq(houseContacts.principalId, principal.id));
  if (existing.length >= HOUSE_CONTACT_CAP) {
    throw new ProtocolError("forbidden", "Too many contacts", 403);
  }
  const email =
    input.email == null || (typeof input.email === "string" && !input.email.trim())
      ? null
      : parseWaitlistEmail(String(input.email));
  if (email) await assertUniqueHouseContact(principal.id, { email });
  const id = mintToken("hct");
  try {
    await db.insert(houseContacts).values({
      id,
      principalId: principal.id,
      label,
      email: email ?? undefined,
    });
  } catch {
    await db.execute(sql`
      INSERT INTO house_contacts (id, principal_id, label, email)
      VALUES (${id}, ${principal.id}, ${label}, ${email})
    `);
  }
  if (email) await queueContactConfirm(principal, id, email, origin);
  return listHouseContacts(principal.id);
}

export async function saveHouseContact(
  principal: HousePrincipal,
  contactId: string,
  input: { label?: unknown; email?: unknown },
  origin?: string,
): Promise<HouseContactView[]> {
  if (principal.type !== "org") throw new ProtocolError("forbidden", "Only a company house has a contact list", 403);
  await ensureHouseContactsSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseContacts)
    .where(and(eq(houseContacts.id, contactId.trim()), eq(houseContacts.principalId, principal.id)))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown contact", 404);
  const email =
    input.email === undefined
      ? row.email
      : input.email == null || (typeof input.email === "string" && !String(input.email).trim())
        ? null
        : parseWaitlistEmail(String(input.email));
  if (email) await assertUniqueHouseContact(principal.id, { exceptId: row.id, email });
  const same = Boolean(email && row.email?.toLowerCase() === email && row.emailVerifiedAt);
  await db
    .update(houseContacts)
    .set({
      label: input.label === undefined ? row.label : parseLabel(input.label, true),
      email,
      emailVerifiedAt: same ? row.emailVerifiedAt : null,
    })
    .where(eq(houseContacts.id, row.id));
  if (email && !same) await queueContactConfirm(principal, row.id, email, origin);
  return listHouseContacts(principal.id);
}

export async function saveHouseContactPolicy(
  principal: HousePrincipal,
  contactId: string,
  input: { kind: unknown; reasons?: unknown; objectorId?: unknown },
): Promise<HouseContactView[]> {
  if (principal.type !== "org") throw new ProtocolError("forbidden", "Only a company house has a contact list", 403);
  await ensureHouseContactsSchema();
  if (!isPolicyKind(input.kind)) throw new ProtocolError("bad_request", "Unknown policy", 400);
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseContacts)
    .where(and(eq(houseContacts.id, contactId.trim()), eq(houseContacts.principalId, principal.id)))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown contact", 404);
  let reasons: NotifyReasonKey[] = [];
  let objectorId: string | null = null;
  if (input.kind !== "all") {
    reasons = parseReasons(input.reasons);
  }
  if (input.kind === "objector") {
    const allowed = await houseDeskIds(principal.id);
    const id = typeof input.objectorId === "string" ? input.objectorId.trim() : "";
    if (!id || !allowed.has(id)) throw new ProtocolError("bad_request", "Pick the objecting assistant", 400);
    objectorId = id;
  }
  const [current] = await db
    .select()
    .from(houseContactPolicies)
    .where(eq(houseContactPolicies.contactId, row.id))
    .limit(1);
  if (current) {
    await db
      .update(houseContactPolicies)
      .set({ kind: input.kind, reasons, objectorId })
      .where(eq(houseContactPolicies.id, current.id));
  } else {
    await db.insert(houseContactPolicies).values({
      id: mintToken("hpl"),
      contactId: row.id,
      kind: input.kind,
      reasons,
      objectorId,
    });
  }
  return listHouseContacts(principal.id);
}

export async function removeHouseContact(principal: HousePrincipal, contactId: string): Promise<HouseContactView[]> {
  if (principal.type !== "org") throw new ProtocolError("forbidden", "Only a company house has a contact list", 403);
  await ensureHouseContactsSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseContacts)
    .where(and(eq(houseContacts.id, contactId.trim()), eq(houseContacts.principalId, principal.id)))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown contact", 404);
  await db.delete(houseContactPolicies).where(eq(houseContactPolicies.contactId, row.id));
  await db.delete(emailConfirmTokens).where(eq(emailConfirmTokens.contactId, row.id));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.contactId, row.id));
  await db.delete(houseContacts).where(eq(houseContacts.id, row.id));
  return listHouseContacts(principal.id);
}

export async function resendHouseContactConfirm(principal: HousePrincipal, contactId: string, origin?: string) {
  if (principal.type !== "org") throw new ProtocolError("forbidden", "Only a company house has a contact list", 403);
  await ensureHouseContactsSchema();
  const [row] = await getDb()
    .select()
    .from(houseContacts)
    .where(and(eq(houseContacts.id, contactId.trim()), eq(houseContacts.principalId, principal.id)))
    .limit(1);
  if (!row?.email || row.emailVerifiedAt) throw new ProtocolError("bad_request", "nothing to confirm", 400);
  await queueContactConfirm(principal, row.id, row.email, origin);
}

export async function queueContactConfirm(
  principal: HousePrincipal,
  contactId: string,
  email: string,
  origin?: string,
) {
  const raw = mintToken("emc");
  const db = getDb();
  await db.delete(emailConfirmTokens).where(eq(emailConfirmTokens.contactId, contactId));
  await db.insert(emailConfirmTokens).values({
    tokenHash: hashSecret(raw),
    principalId: principal.id,
    contactId,
    email,
    expiresAt: new Date(Date.now() + CONFIRM_MS),
  });
  const base = (origin || defaultPublicOrigin()).replace(/\/$/, "");
  const locale = isLocale(principal.contactLocale) ? principal.contactLocale : "en";
  const t = notifyCopy(locale);
  const url = `${base}/${locale}/confirm-email/${raw}`;
  try {
    await sendMail({ to: email, subject: t.confirmSubject, text: `${t.confirmBody}\n\n${url}` });
  } catch {
    // Token is stored; Contacts can resend.
  }
}

export async function confirmContactEmail(contactId: string, email: string) {
  await ensureHouseContactsSchema();
  const db = getDb();
  const [row] = await db.select().from(houseContacts).where(eq(houseContacts.id, contactId)).limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown contact", 404);
  await assertUniqueHouseContact(row.principalId, { exceptId: row.id, email });
  await db
    .update(houseContacts)
    .set({ email, emailVerifiedAt: new Date() })
    .where(eq(houseContacts.id, contactId));
}

export async function unlinkHouseContactTelegram(principal: HousePrincipal, contactId: string) {
  if (principal.type !== "org") throw new ProtocolError("forbidden", "Only a company house has a contact list", 403);
  await ensureHouseContactsSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(houseContacts)
    .where(and(eq(houseContacts.id, contactId.trim()), eq(houseContacts.principalId, principal.id)))
    .limit(1);
  if (!row) throw new ProtocolError("not_found", "Unknown contact", 404);
  await db
    .update(houseContacts)
    .set({ telegramChatId: null, telegramLinkedAt: null, telegramHandle: null })
    .where(eq(houseContacts.id, row.id));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.contactId, row.id));
  return listHouseContacts(principal.id);
}
