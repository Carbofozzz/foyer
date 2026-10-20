/** x402 exact/EIP-3009 helpers. The broker signs; Foyer never holds the payer key. */

const USDC_NAMES = new Set(["usdc", "usd coin"]);
const USDC_ADDRESSES = new Set(
  [
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base
    "0x036cbd53842c5426634e7929541ec2318f3dcf7e", // Base Sepolia
  ].map((item) => item.toLowerCase()),
);

export type X402Accept = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
  resource?: string;
};

export type X402Required = {
  version: number;
  resource?: string | { url?: string };
  accepts: X402Accept[];
};

export function toAtomic(amount: unknown, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("decimals");
  const raw = typeof amount === "number" ? String(amount) : String(amount ?? "");
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("amount");
  const [whole, frac = ""] = raw.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + padded);
}

export function decimalsOf(accept: X402Accept): number {
  const extra = accept.extra || {};
  const n = typeof extra.decimals === "number" ? extra.decimals : Number(extra.decimals);
  if (Number.isInteger(n) && n >= 0 && n <= 36) return n;
  return assetLooksUsdc(accept) ? 6 : 18;
}

export function chainIdOf(network: string): number {
  const raw = network.trim().toLowerCase();
  if (raw === "base") return 8453;
  if (raw === "base-sepolia") return 84532;
  if (raw === "polygon") return 137;
  const caip = raw.match(/^eip155:(\d+)$/);
  if (caip) return Number(caip[1]);
  if (/^\d+$/.test(raw)) return Number(raw);
  throw new Error(`Unsupported x402 network: ${network}`);
}

export function parsePaymentRequired(input: {
  status: number;
  headers: Record<string, string>;
  body: string;
}): X402Required | null {
  const header = headerOf(input.headers, "payment-required");
  if (header) {
    try {
      return normalizeRequired(JSON.parse(Buffer.from(header, "base64").toString("utf8")));
    } catch {
      return null;
    }
  }
  if (input.status !== 402 || !input.body.trim()) return null;
  try {
    return normalizeRequired(JSON.parse(input.body));
  } catch {
    return null;
  }
}

export function pickAccept(
  call: { url: string; amount: unknown; asset: string },
  required: X402Required | null,
): (X402Accept & { resourceUrl: string; decimals: number }) | null {
  if (!required?.accepts.length) return null;
  const callHost = hostOfUrl(call.url);
  if (!callHost) return null;
  for (const row of required.accepts) {
    if ((row.scheme || "exact") !== "exact") continue;
    const resourceUrl = resourceUrlOf(required, row, call.url);
    if (hostOfUrl(resourceUrl) !== callHost) continue;
    if (!assetMatches(call.asset, row)) continue;
    let decimals: number;
    let asked: bigint;
    let charge: bigint;
    try {
      decimals = decimalsOf(row);
      asked = toAtomic(call.amount, decimals);
      charge = BigInt(row.amount);
    } catch {
      continue;
    }
    if (charge < 0n || charge > asked) continue;
    return { ...row, resourceUrl, decimals };
  }
  return null;
}

/** Null when the 402 challenge fits the granted call. */
export function challengeRefusal(
  call: { url: string; amount: unknown; asset: string },
  required: X402Required | null,
): string | null {
  if (!required) return "payment_required";
  if (!pickAccept(call, required)) return "challenge";
  return null;
}

function normalizeRequired(json: Record<string, unknown>): X402Required {
  const version = Number(json.x402Version ?? json.version ?? 1) || 1;
  const rawAccepts = Array.isArray(json.accepts)
    ? json.accepts
    : json.scheme
      ? [json]
      : [];
  return {
    version,
    resource: json.resource as X402Required["resource"],
    accepts: rawAccepts
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map(normalizeAccept),
  };
}

function normalizeAccept(row: Record<string, unknown>): X402Accept {
  const extra = row.extra && typeof row.extra === "object" && !Array.isArray(row.extra) ? (row.extra as Record<string, unknown>) : {};
  const amount = row.amount ?? row.maxAmountRequired;
  return {
    scheme: String(row.scheme || "exact"),
    network: String(row.network || ""),
    amount: String(amount ?? ""),
    asset: String(row.asset || ""),
    payTo: String(row.payTo || ""),
    maxTimeoutSeconds: Number(row.maxTimeoutSeconds || 60),
    extra,
    resource: typeof row.resource === "string" ? row.resource : undefined,
  };
}

function resourceUrlOf(required: X402Required, row: X402Accept, fallback: string): string {
  if (typeof required.resource === "string" && required.resource) return required.resource;
  if (required.resource && typeof required.resource === "object" && required.resource.url) return required.resource.url;
  if (row.resource) return row.resource;
  return fallback;
}

function assetMatches(granted: string, accept: X402Accept): boolean {
  const want = granted.trim().toLowerCase();
  const token = accept.asset.trim().toLowerCase();
  if (want.startsWith("0x")) return want === token;
  if (token === want) return true;
  const name = String(accept.extra?.name || "").trim().toLowerCase();
  if (name && name === want) return true;
  if (USDC_NAMES.has(want)) return USDC_NAMES.has(name) || USDC_ADDRESSES.has(token);
  return false;
}

function assetLooksUsdc(accept: X402Accept): boolean {
  const name = String(accept.extra?.name || "").trim().toLowerCase();
  return USDC_NAMES.has(name) || USDC_ADDRESSES.has(accept.asset.trim().toLowerCase());
}

function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function headerOf(headers: Record<string, string>, name: string): string {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want && value) return value;
  }
  return "";
}
