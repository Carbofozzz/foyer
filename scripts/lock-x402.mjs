/**
 * x402 exact payer used by foyer-lock.
 * Probe HTTP 402, match the challenge to the grant, sign EIP-3009, then settle.
 * A bare GET is not a payment.
 */
import { randomBytes } from "node:crypto";
import { hasPayerKey, payerKey } from "./lock-secret.mjs";

export { hasPayerKey };

const USDC_NAMES = new Set(["usdc", "usd coin"]);
const USDC_ADDRESSES = new Set(
  [
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  ].map((item) => item.toLowerCase()),
);

export function toAtomic(amount, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("decimals");
  const raw = typeof amount === "number" ? String(amount) : String(amount ?? "");
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("amount");
  const [whole, frac = ""] = raw.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + padded);
}

export function decimalsOf(accept) {
  const extra = accept.extra || {};
  const n = typeof extra.decimals === "number" ? extra.decimals : Number(extra.decimals);
  if (Number.isInteger(n) && n >= 0 && n <= 36) return n;
  return assetLooksUsdc(accept) ? 6 : 18;
}

export function chainIdOf(network) {
  const raw = String(network || "")
    .trim()
    .toLowerCase();
  if (raw === "base") return 8453;
  if (raw === "base-sepolia") return 84532;
  if (raw === "polygon") return 137;
  const caip = raw.match(/^eip155:(\d+)$/);
  if (caip) return Number(caip[1]);
  if (/^\d+$/.test(raw)) return Number(raw);
  throw new Error(`Unsupported x402 network: ${network}`);
}

export function parsePaymentRequired(status, headers, body) {
  const header = headerOf(headers, "payment-required");
  if (header) {
    try {
      return normalizeRequired(JSON.parse(Buffer.from(header, "base64").toString("utf8")));
    } catch {
      return null;
    }
  }
  if (status !== 402 || !String(body || "").trim()) return null;
  try {
    return normalizeRequired(JSON.parse(body));
  } catch {
    return null;
  }
}

export function pickAccept(call, required) {
  if (!required?.accepts?.length) return null;
  const callHost = hostOfUrl(call.url);
  if (!callHost) return null;
  for (const row of required.accepts) {
    if ((row.scheme || "exact") !== "exact") continue;
    const resourceUrl = resourceUrlOf(required, row, call.url);
    if (hostOfUrl(resourceUrl) !== callHost) continue;
    if (!assetMatches(call.asset, row)) continue;
    let decimals;
    let asked;
    let charge;
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

export function challengeRefusal(call, required) {
  if (!required) return "payment_required";
  if (!pickAccept(call, required)) return "challenge";
  return null;
}

export async function probe402(url) {
  const response = await fetch(String(url), { method: "GET", redirect: "manual" });
  const body = await response.text();
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const required = parsePaymentRequired(response.status, headers, body);
  return { status: response.status, headers, body, required };
}

export async function payX402(input) {
  const picked = pickAccept(input.call, input.required);
  if (!picked) throw new Error("Payment does not match the grant");
  const payment = await signExactEvm(payerKey(), picked, input.call.url, input.required.version);
  const facilitator = process.env.FOYER_X402_FACILITATOR?.replace(/\/$/, "");
  if (facilitator) {
    return settleViaFacilitator(facilitator, { ...input, picked, payment });
  }
  return retryWithPayment(picked.resourceUrl, input.required.version, payment, picked);
}


async function signExactEvm(privateKey, picked, url, version) {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(privateKey);
  const extra = picked.extra || {};
  const now = Math.floor(Date.now() / 1000);
  const validAfter = 0;
  const validBefore = now + Math.max(30, Number(picked.maxTimeoutSeconds || 60));
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  const from = account.address;
  const to = picked.payTo;
  const value = picked.amount;
  const signature = await account.signTypedData({
    domain: {
      name: String(extra.name || "USD Coin"),
      version: String(extra.version || "2"),
      chainId: chainIdOf(picked.network),
      verifyingContract: picked.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    },
  });
  const authorization = {
    from,
    to,
    value: String(value),
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
  };
  if (Number(version) >= 2) {
    return {
      x402Version: 2,
      resource: { url, description: "", mimeType: "" },
      accepted: {
        scheme: "exact",
        network: picked.network,
        amount: String(value),
        asset: picked.asset,
        payTo: picked.payTo,
        maxTimeoutSeconds: picked.maxTimeoutSeconds,
        extra: { assetTransferMethod: "eip3009", name: extra.name, version: extra.version },
      },
      payload: { signature, authorization },
    };
  }
  return {
    x402Version: 1,
    scheme: "exact",
    network: picked.network,
    payload: { signature, authorization },
  };
}

function encodePayment(payment) {
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

async function retryWithPayment(url, version, payment, picked) {
  const encoded = encodePayment(payment);
  const headers = { accept: "application/json, */*" };
  if (Number(version) >= 2) headers["PAYMENT-SIGNATURE"] = encoded;
  else headers["X-PAYMENT"] = encoded;
  const response = await fetch(url, { method: "GET", headers });
  const body = await response.text();
  const settlement = decodeSettlement(response.headers);
  if (response.status === 402) {
    throw new Error(settlement?.error || "x402 settle refused");
  }
  if (!response.ok) throw new Error(`Paid request failed (${response.status})`);
  return {
    ran: "pay.x402",
    settled: true,
    status: response.status,
    network: picked.network,
    asset: picked.asset,
    amount: picked.amount,
    pay_to: picked.payTo,
    from: payment.payload?.authorization?.from,
    settlement,
    body,
  };
}

async function settleViaFacilitator(facilitator, input) {
  const response = await fetch(`${facilitator}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant: input.grant,
      invocation_id: input.invocationId,
      url: input.call.url,
      amount: input.call.amount,
      asset: input.call.asset,
      payment: input.payment,
      requirements: input.picked,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `facilitator refused (${response.status})`);
  }
  return { ran: "pay.x402", via: "facilitator", settled: true, ...body.data };
}

function decodeSettlement(headers) {
  const raw = headers.get("PAYMENT-RESPONSE") || headers.get("X-PAYMENT-RESPONSE");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeRequired(json) {
  const version = Number(json.x402Version ?? json.version ?? 1) || 1;
  const rawAccepts = Array.isArray(json.accepts) ? json.accepts : json.scheme ? [json] : [];
  return {
    version,
    resource: json.resource,
    accepts: rawAccepts.filter((row) => row && typeof row === "object").map(normalizeAccept),
  };
}

function normalizeAccept(row) {
  const extra = row.extra && typeof row.extra === "object" && !Array.isArray(row.extra) ? row.extra : {};
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

function resourceUrlOf(required, row, fallback) {
  if (typeof required.resource === "string" && required.resource) return required.resource;
  if (required.resource && typeof required.resource === "object" && required.resource.url) return required.resource.url;
  if (row.resource) return row.resource;
  return fallback;
}

function assetMatches(granted, accept) {
  const want = String(granted || "")
    .trim()
    .toLowerCase();
  const token = String(accept.asset || "")
    .trim()
    .toLowerCase();
  if (want.startsWith("0x")) return want === token;
  if (token === want) return true;
  const name = String(accept.extra?.name || "")
    .trim()
    .toLowerCase();
  if (name && name === want) return true;
  if (USDC_NAMES.has(want)) return USDC_NAMES.has(name) || USDC_ADDRESSES.has(token);
  return false;
}

function assetLooksUsdc(accept) {
  const name = String(accept.extra?.name || "")
    .trim()
    .toLowerCase();
  return USDC_NAMES.has(name) || USDC_ADDRESSES.has(String(accept.asset || "").trim().toLowerCase());
}

function hostOfUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function headerOf(headers, name) {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === want && value) return value;
  }
  return "";
}
