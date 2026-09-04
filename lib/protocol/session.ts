import { createHmac, randomBytes } from "node:crypto";
import { recoverMessageAddress } from "viem";
import { ownerKey } from "@/lib/gen/chain";
import { loginMessage } from "./login-message";

const SESSION_COOKIE = "foyer_session";
const NONCE_COOKIE = "foyer_nonce";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;
const NONCE_MS = 10 * 60 * 1000;

function secret(): string {
  return process.env.CRON_SECRET || process.env.DATABASE_URL || "foyer-dev-seal";
}

function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function issueNonce(): { nonce: string; issued: number; mac: string } {
  const nonce = randomBytes(6).toString("hex");
  const issued = Date.now();
  return { nonce, issued, mac: hmac(`${nonce}.${issued}`) };
}

export function nonceOk(nonce: string, issued: number, mac: string): boolean {
  if (!nonce || !mac || !Number.isFinite(issued)) return false;
  if (Math.abs(Date.now() - issued) > NONCE_MS) return false;
  return hmac(`${nonce}.${issued}`) === mac;
}

export function nonceCookie(ticket: { nonce: string; issued: number; mac: string }) {
  return {
    name: NONCE_COOKIE,
    value: `${ticket.nonce}.${ticket.issued}.${ticket.mac}`,
    maxAge: Math.floor(NONCE_MS / 1000),
  };
}

export function clearNonceCookie() {
  return { name: NONCE_COOKIE, value: "", maxAge: 0 };
}

export function readNonceTicket(request: Request): { nonce: string; issued: number; mac: string } | null {
  const raw = cookieValue(request.headers.get("cookie") ?? "", NONCE_COOKIE);
  if (!raw) return null;
  const [nonce, issuedRaw, mac] = raw.split(".");
  const issued = Number(issuedRaw);
  if (!nonce || !mac || !Number.isFinite(issued)) return null;
  if (!nonceOk(nonce, issued, mac)) return null;
  return { nonce, issued, mac };
}

export async function addressFromLogin(
  request: Request,
  message: string,
  signature: string,
): Promise<`0x${string}` | null> {
  if (!signature.startsWith("0x")) return null;
  const ticket = readNonceTicket(request);
  if (!ticket) return null;
  if (message !== loginMessage(ticket.nonce)) return null;
  try {
    return ownerKey(
      await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      }),
    );
  } catch {
    return null;
  }
}

export function sessionCookie(address: string): { name: string; value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const value = `${address}.${exp}.${hmac(`${address.toLowerCase()}.${exp}`)}`;
  return { name: SESSION_COOKIE, value, maxAge: MAX_AGE_SEC };
}

export function clearSessionCookie(): { name: string; value: string; maxAge: number } {
  return { name: SESSION_COOKIE, value: "", maxAge: 0 };
}

export function readSession(request: Request): { address: `0x${string}` } | null {
  const raw = cookieValue(request.headers.get("cookie") ?? "", SESSION_COOKIE);
  return parseSession(raw);
}

export function parseSession(raw: string | undefined | null): { address: `0x${string}` } | null {
  if (!raw) return null;
  const [address, expRaw, mac] = raw.split(".");
  const exp = Number(expRaw);
  if (!address || !mac || !Number.isFinite(exp)) return null;
  if (exp * 1000 < Date.now()) return null;
  if (hmac(`${address.toLowerCase()}.${exp}`) !== mac) return null;
  const parsed = ownerKey(address);
  if (!parsed) return null;
  return { address: parsed };
}

function cookieValue(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function cookieHeader(spec: { name: string; value: string; maxAge: number }): string {
  const parts = [
    `${spec.name}=${encodeURIComponent(spec.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${spec.maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
