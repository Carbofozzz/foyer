import { timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { principals, telegramLinkTokens } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { defaultPublicOrigin } from "@/lib/mcp/config";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { hashSecret, mintToken } from "@/lib/protocol/keys";
import { notifyCopy } from "./mail";

const LINK_MS = 60 * 60 * 1000;

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
  const raw = mintToken("tgl");
  const db = getDb();
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, principal.id));
  await db.insert(telegramLinkTokens).values({
    tokenHash: hashSecret(raw),
    principalId: principal.id,
    expiresAt: new Date(Date.now() + LINK_MS),
  });
  return `https://t.me/${username}?start=${raw}`;
}

export async function unlinkTelegram(principalId: string): Promise<void> {
  const db = getDb();
  await db
    .update(principals)
    .set({ telegramChatId: null, telegramLinkedAt: null })
    .where(eq(principals.id, principalId));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, principalId));
}

export async function handleTelegramUpdate(body: unknown): Promise<void> {
  if (!body || typeof body !== "object") return;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== "object") return;
  const chat = (message as { chat?: { id?: unknown } }).chat;
  const text = (message as { text?: unknown }).text;
  const chatId = chat && (typeof chat.id === "number" || typeof chat.id === "string") ? String(chat.id) : "";
  if (!chatId || typeof text !== "string") return;

  const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  if (!start) return;
  const payload = start[1];
  if (!payload) {
    await sendTelegram(chatId, notifyCopy("en").telegramNeedLink).catch(() => undefined);
    return;
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(telegramLinkTokens)
    .where(and(eq(telegramLinkTokens.tokenHash, hashSecret(payload)), gt(telegramLinkTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) {
    await sendTelegram(chatId, notifyCopy("en").telegramUnknown).catch(() => undefined);
    return;
  }

  await db
    .update(principals)
    .set({ telegramChatId: null, telegramLinkedAt: null })
    .where(eq(principals.telegramChatId, chatId));
  const [house] = await db.select().from(principals).where(eq(principals.id, row.principalId)).limit(1);
  await db
    .update(principals)
    .set({ telegramChatId: chatId, telegramLinkedAt: new Date() })
    .where(eq(principals.id, row.principalId));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.principalId, row.principalId));
  const locale = house && isLocale(house.contactLocale) ? house.contactLocale : "en";
  await sendTelegram(chatId, notifyCopy(locale).telegramLinked).catch(() => undefined);
}
