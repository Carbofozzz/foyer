import { ACTION_KINDS, type ActionKind, type ActionPayload, type EvidenceItem } from "./types";
import { ABUSE } from "./abuse";
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
  if (summary.length > ABUSE.summary) throw new ProtocolError("bad_request", "payload.summary is too long", 400);
  const payload: ActionPayload = { kind, summary };
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
