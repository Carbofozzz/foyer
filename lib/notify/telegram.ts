import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, or } from "drizzle-orm";
import { principals, telegramBotState, telegramLinkTokens } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { hashSecret } from "@/lib/protocol/keys";
import { notifyCopy } from "./mail";

const LINK_MS = 60 * 60 * 1000;
const BOT_STATE_ID = "bot";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function botUsername(): string | undefined {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
}

export function telegramWebhookSecretOk(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = botToken();
  if (!token) {
    if (process.env.NODE_ENV === "production") throw new Error("telegram is not configured");
    console.info(`[telegram off] chat=${chatId}\n${text}`);
    return;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`telegram ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function registerTelegramWebhook(origin?: string): Promise<void> {
  const token = botToken();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) throw new Error("telegram is not configured");
  const base = (origin || defaultPublicOrigin()).replace(/\/$/, "");
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${base}/api/telegram`,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`setWebhook ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function mintTelegramStartUrl(principal: HousePrincipal): Promise<string | null> {
  const username = botUsername();
  if (!botToken() || !username) return null;
  const db = getDb();
  try {
    const [existing] = await db
      .select()
      .from(telegramLinkTokens)
      .where(and(eq(telegramLinkTokens.principalId, principal.id), gt(telegramLinkTokens.expiresAt, new Date())))
      .limit(1);
    if (existing?.payload) return `https://t.me/${username}?start=${existing.payload}`;
    const raw = randomBytes(16).toString("hex");
    await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, principal.id));
    await db.insert(telegramLinkTokens).values({
      tokenHash: hashSecret(raw),
      principalId: principal.id,
      payload: raw,
      expiresAt: new Date(Date.now() + LINK_MS),
    });
    return `https://t.me/${username}?start=${raw}`;
  } catch {
    return null;
  }
}

export async function unlinkTelegram(principalId: string): Promise<void> {
  const db = getDb();
  await db
    .update(principals)
    .set({ telegramChatId: null, telegramLinkedAt: null, telegramHandle: null })
    .where(eq(principals.id, principalId));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, principalId));
}

function telegramHandleFromMessage(message: { from?: { username?: unknown; first_name?: unknown } }): string | null {
  const from = message.from;
  if (!from) return null;
  if (typeof from.username === "string" && from.username.trim()) return from.username.trim();
  if (typeof from.first_name === "string" && from.first_name.trim()) return from.first_name.trim();
  return null;
}

export async function drainTelegramUpdates(): Promise<void> {
  const token = botToken();
  if (!token) return;
  try {
    const db = getDb();
    const [cursor] = await db.select().from(telegramBotState).where(eq(telegramBotState.id, BOT_STATE_ID)).limit(1);
    const last = cursor ? Number(cursor.lastUpdateId) : 0;
    const offset = Number.isFinite(last) && last > 0 ? last + 1 : 0;
    let response = await telegramGetUpdates(token, offset);
    let body = await readTelegramBody(response);
    if (webhookBlocksPolling(response.status, body)) {
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: false }),
      });
      response = await telegramGetUpdates(token, offset);
      body = await readTelegramBody(response);
    }
    if (!response.ok || !body.ok || !Array.isArray(body.result)) return;
    let maxId = Number.isFinite(last) ? last : 0;
    for (const update of body.result) {
      if (!update || typeof update !== "object") continue;
      const id = (update as { update_id?: unknown }).update_id;
      if (typeof id === "number" && id > maxId) maxId = id;
      await handleTelegramUpdate(update);
    }
    if (maxId > 0) {
      await db
        .insert(telegramBotState)
        .values({ id: BOT_STATE_ID, lastUpdateId: String(maxId) })
        .onConflictDoUpdate({ target: telegramBotState.id, set: { lastUpdateId: String(maxId) } });
    }
  } catch {
    // Do not fail Contacts.
  }
}

async function telegramGetUpdates(token: string, offset: number): Promise<Response> {
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set("timeout", "0");
  if (offset > 0) url.searchParams.set("offset", String(offset));
  return fetch(url);
}

async function readTelegramBody(response: Response): Promise<{ ok?: boolean; result?: unknown; description?: unknown }> {
  try {
    return (await response.json()) as { ok?: boolean; result?: unknown; description?: unknown };
  } catch {
    return {};
  }
}

function webhookBlocksPolling(status: number, body: { ok?: boolean; description?: unknown }): boolean {
  if (status === 409) return true;
  const description = typeof body.description === "string" ? body.description : "";
  return body.ok === false && /webhook/i.test(description);
}

export async function handleTelegramUpdate(body: unknown): Promise<void> {
  if (!body || typeof body !== "object") return;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== "object") return;
  const chat = (message as { chat?: { id?: unknown } }).chat;
  const text = (message as { text?: unknown }).text;
  const chatId = chat && (typeof chat.id === "number" || typeof chat.id === "string") ? String(chat.id) : "";
  if (!chatId || typeof text !== "string") return;

  const start = text.trim().replace(/\u00a0/g, " ").match(/^\/start(?:@\S+)?(?:\s+(\S+))?$/i);
  if (!start) return;
  const payload = decodeStartPayload(start[1]);
  if (!payload) {
    await sendTelegram(chatId, notifyCopy("en").telegramNeedLink).catch(() => undefined);
    return;
  }

  const db = getDb();
  const tokenHash = hashSecret(payload);
  const [row] = await db
    .select()
    .from(telegramLinkTokens)
    .where(
      and(
        gt(telegramLinkTokens.expiresAt, new Date()),
        or(eq(telegramLinkTokens.tokenHash, tokenHash), eq(telegramLinkTokens.payload, payload)),
      ),
    )
    .limit(1);
  if (!row) {
    await sendTelegram(chatId, notifyCopy("en").telegramUnknown).catch(() => undefined);
    return;
  }

  const handle = telegramHandleFromMessage(message as { from?: { username?: unknown; first_name?: unknown } });
  await db
    .update(principals)
    .set({ telegramChatId: null, telegramLinkedAt: null, telegramHandle: null })
    .where(eq(principals.telegramChatId, chatId));
  const [house] = await db.select().from(principals).where(eq(principals.id, row.principalId)).limit(1);
  await db
    .update(principals)
    .set({ telegramChatId: chatId, telegramLinkedAt: new Date(), telegramHandle: handle })
    .where(eq(principals.id, row.principalId));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, row.principalId));
  const locale = house && isLocale(house.contactLocale) ? house.contactLocale : "en";
  await sendTelegram(chatId, notifyCopy(locale).telegramLinked).catch(() => undefined);
}

function decodeStartPayload(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
