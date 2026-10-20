export const PILOT_HANDS = ["git.push", "pay.x402", "pay.ap2"] as const;
export type PilotHand = (typeof PILOT_HANDS)[number];

/** On until the owner turns them off. pay.ap2 starts off. */
export const DEFAULT_LOCK_HANDS = ["git.push", "pay.x402"] as const;

export function isPilotHand(hand: string): hand is PilotHand {
  return hand === "git.push" || hand === "pay.x402" || hand === "pay.ap2";
}

export function enabledLockHands(raw: unknown): PilotHand[] {
  const list = Array.isArray(raw) ? raw : [...DEFAULT_LOCK_HANDS];
  return [...new Set(list.filter((item): item is PilotHand => typeof item === "string" && isPilotHand(item)))];
}

/** Pull a pilot hand out of a permitted payload. No hand → no grant (honor path). */
export function handFromPayload(payload: Record<string, unknown> | null): {
  hand: PilotHand;
  constraints: Record<string, unknown>;
} | null {
  if (!payload || typeof payload.hand !== "string" || !payload.hand) return null;
  if (!isPilotHand(payload.hand)) {
    throw new Error(`Unknown hand: ${payload.hand}`);
  }
  return { hand: payload.hand, constraints: normalizeConstraints(payload.hand, payload.constraints) };
}

export function normalizeConstraints(hand: PilotHand, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("constraints object required");
  const row = raw as Record<string, unknown>;
  if (hand === "git.push") {
    const repo = requiredString(row.repo, "repo");
    const ref = requiredString(row.ref, "ref");
    const out: Record<string, unknown> = { repo, ref };
    if (row.commit_sha != null && row.commit_sha !== "") out.commit_sha = requiredString(row.commit_sha, "commit_sha");
    return out;
  }
  if (hand === "pay.x402") {
    const hosts = stringList(row.hosts, "hosts");
    if (hosts.length === 0) throw new Error("hosts required");
    return {
      hosts,
      max_per_req: requiredNumber(row.max_per_req, "max_per_req"),
      max_session: requiredNumber(row.max_session, "max_session"),
      asset: requiredString(row.asset, "asset"),
    };
  }
  return {
    checkout_hash: requiredString(row.checkout_hash, "checkout_hash"),
    max: requiredNumber(row.max, "max"),
    asset: requiredString(row.asset, "asset"),
  };
}

/** Null when the call fits. Otherwise a short reason. Unknown fields are ignored. */
export function constraintMismatch(hand: string, constraints: Record<string, unknown>, args: Record<string, unknown>): string | null {
  if (hand === "git.push") {
    if (args.repo !== constraints.repo) return "repo";
    if (args.ref !== constraints.ref) return "ref";
    if (typeof constraints.commit_sha === "string" && args.commit_sha !== constraints.commit_sha) return "commit_sha";
    return null;
  }
  if (hand === "pay.x402") {
    const hosts = Array.isArray(constraints.hosts) ? constraints.hosts : [];
    const host = hostOf(args);
    if (!host || !hosts.includes(host)) return "host";
    const amount = typeof args.amount === "number" ? args.amount : Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0) return "amount";
    if (amount > Number(constraints.max_per_req) || amount > Number(constraints.max_session)) return "amount";
    if (args.asset !== constraints.asset) return "asset";
    return null;
  }
  if (hand === "pay.ap2") {
    if (args.checkout_hash !== constraints.checkout_hash) return "checkout_hash";
    if (args.asset !== constraints.asset) return "asset";
    const amount = typeof args.amount === "number" ? args.amount : Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(constraints.max)) return "amount";
    return null;
  }
  return "hand";
}

export type SettleRequest = {
  url: string;
  amount: number;
  asset: string;
};

/** Why a facilitator must refuse. Null means the consumed grant covers this settle. */
export function settleRefusal(input: {
  hand: string;
  status: string;
  constraints: Record<string, unknown>;
  invocationArgs: Record<string, unknown> | null;
  request: SettleRequest;
}): string | null {
  if (input.hand !== "pay.x402") return "hand";
  if (input.status !== "consumed") return "status";
  if (!input.invocationArgs) return "invocation";
  const asked = input.request;
  if (hostOf(input.invocationArgs) !== hostOf(asked)) return "host";
  if (Number(input.invocationArgs.amount) !== Number(asked.amount)) return "amount";
  if (input.invocationArgs.asset !== asked.asset) return "asset";
  return constraintMismatch(input.hand, input.constraints, {
    url: asked.url,
    amount: asked.amount,
    asset: asked.asset,
  });
}

export function hostOf(args: Record<string, unknown>): string | null {
  if (typeof args.host === "string" && args.host) return args.host.toLowerCase();
  if (typeof args.url !== "string") return null;
  try {
    return new URL(args.url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function requiredNumber(value: unknown, name: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} required`);
  return n;
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${name} required`);
  return value.map((item) => requiredString(item, name).toLowerCase());
}
