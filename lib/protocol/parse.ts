import { WAKE_KINDS, type ActionPayload, type EvidenceItem, type WakeKind } from "./types";
import { ABUSE } from "./abuse";
import { ProtocolError } from "./errors";

export function parsePayload(raw: unknown): ActionPayload {
  const body = isRecord(raw) ? raw : {};
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) throw new ProtocolError("bad_request", "payload.summary is required", 400);
  if (summary.length > ABUSE.summary) throw new ProtocolError("bad_request", "payload.summary is too long", 400);
  const payload: ActionPayload = { summary };
  if (body.amount != null) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0 || body.amount > 1e12) {
      throw new ProtocolError("bad_request", "payload.amount is invalid", 400);
    }
    payload.amount = body.amount;
  }
  if (typeof body.currency === "string" && body.currency.trim()) {
    const currency = body.currency.trim();
    if (!/^[A-Za-z]{1,8}$/.test(currency)) {
      throw new ProtocolError("bad_request", "payload.currency is invalid", 400);
    }
    payload.currency = currency;
  }
  const extras = Object.entries(body).filter(
    ([key]) => key !== "kind" && key !== "summary" && key !== "amount" && key !== "currency",
  );
  if (extras.length > ABUSE.extraKeys) {
    throw new ProtocolError("bad_request", "payload has too many extra fields", 400);
  }
  for (const [key, value] of extras) {
    if (typeof value === "string") {
      if (value.length > ABUSE.extraChars) {
        throw new ProtocolError("bad_request", `payload.${key} is too long`, 400);
      }
      payload[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      payload[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      payload[key] = value;
      continue;
    }
    throw new ProtocolError("bad_request", `payload.${key} must be a string, number, or boolean`, 400);
  }
  return payload;
}

export function parseEvidence(raw: unknown): EvidenceItem[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new ProtocolError("bad_request", "evidence must be an array", 400);
  if (raw.length > ABUSE.evidenceItems) throw new ProtocolError("bad_request", "too many evidence items", 400);
  return raw.map((item, index) => {
    if (!isRecord(item) || typeof item.value !== "string") {
      throw new ProtocolError("bad_request", `evidence[${index}] needs a value`, 400);
    }
    if (item.value.length > ABUSE.evidenceValue) {
      throw new ProtocolError("bad_request", `evidence[${index}] is too long`, 400);
    }
    const type = item.type === "link" || item.type === "stub" ? item.type : "text";
    return { type, value: item.value };
  });
}

export function parseCounterAction(raw: unknown): ActionPayload | null {
  if (raw == null) return null;
  if (!isRecord(raw)) throw new ProtocolError("bad_request", "counter_action must be an object", 400);
  return parsePayload(raw);
}

export function asPayload(raw: unknown): ActionPayload {
  return parsePayload(raw);
}

export function asEvidence(raw: unknown): EvidenceItem[] {
  try {
    return parseEvidence(raw);
  } catch {
    return [];
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AgentWakeSpec = {
  wake: WakeKind;
  callbackUrl: string | null;
  callbackSecret: string | null;
};

export function parseAgentWake(body: Record<string, unknown>): AgentWakeSpec {
  const raw = typeof body.wake === "string" ? body.wake.trim() : "outbound";
  if (!WAKE_KINDS.includes(raw as WakeKind)) {
    throw new ProtocolError("bad_request", "wake must be outbound or callback", 400);
  }
  if (raw === "hosted") {
    throw new ProtocolError("bad_request", "hosted agents are not available", 400);
  }
  const wake = raw as WakeKind;
  if (wake !== "callback") {
    return { wake, callbackUrl: null, callbackSecret: null };
  }
  const callbackUrl = parseCallbackUrl(body.callback_url);
  const secretRaw = typeof body.callback_secret === "string" ? body.callback_secret.trim() : "";
  if (secretRaw.length > 256) {
    throw new ProtocolError("bad_request", "callback_secret is too long", 400);
  }
  return { wake, callbackUrl, callbackSecret: secretRaw || null };
}

export function parseCallbackUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ProtocolError("bad_request", "callback_url is required", 400);
  }
  const text = raw.trim();
  if (text.length > 2048) {
    throw new ProtocolError("bad_request", "callback_url is too long", 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new ProtocolError("bad_request", "callback_url is invalid", 400);
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "https:") return parsed.toString();
  if (parsed.protocol === "http:" && local) return parsed.toString();
  throw new ProtocolError("bad_request", "callback_url must be https", 400);
}
