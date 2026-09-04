import { ACTION_KINDS, type ActionKind, type ActionPayload, type EvidenceItem } from "./types";
import { ProtocolError } from "./errors";

export function parseKind(value: unknown): ActionKind {
  if (typeof value !== "string" || !ACTION_KINDS.includes(value as ActionKind)) {
    throw new ProtocolError("bad_request", "kind must be spend, book, message, or cancel", 400);
  }
  return value as ActionKind;
}

export function parsePayload(kind: ActionKind, raw: unknown): ActionPayload {
  const body = isRecord(raw) ? raw : {};
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) throw new ProtocolError("bad_request", "payload.summary is required", 400);
  const payload: ActionPayload = { kind, summary };
  if (typeof body.amount === "number" && Number.isFinite(body.amount)) payload.amount = body.amount;
  if (typeof body.currency === "string" && body.currency.trim()) payload.currency = body.currency.trim();
  for (const [key, value] of Object.entries(body)) {
    if (key === "kind" || key === "summary" || key === "amount" || key === "currency") continue;
    payload[key] = value;
  }
  return payload;
}

export function parseEvidence(raw: unknown): EvidenceItem[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new ProtocolError("bad_request", "evidence must be an array", 400);
  return raw.map((item, index) => {
    if (!isRecord(item) || typeof item.value !== "string") {
      throw new ProtocolError("bad_request", `evidence[${index}] needs a value`, 400);
    }
    const type = item.type === "link" || item.type === "stub" ? item.type : "text";
    return { type, value: item.value };
  });
}

export function parseCounterAction(raw: unknown): ActionPayload | null {
  if (raw == null) return null;
  if (!isRecord(raw)) throw new ProtocolError("bad_request", "counter_action must be an object", 400);
  const kind = parseKind(raw.kind);
  return parsePayload(kind, raw);
}

export function asPayload(raw: unknown): ActionPayload {
  const body = isRecord(raw) ? raw : {};
  const kind = parseKind(body.kind ?? "message");
  return parsePayload(kind, body);
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
