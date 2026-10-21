/**
 * Local grant check before consume. Public JWKS only. Does not replace consume:
 * one-shot and revoke still live on Foyer.
 */
import { createPublicKey, verify } from "node:crypto";

const cache = { at: 0, keys: /** @type {Array<Record<string, string>> | null} */ (null) };

/** @param {string} token @param {Array<Record<string, string>>} keys */
export function verifyGrantToken(token, keys) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Grant token rejected");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (header.alg !== "EdDSA" || !header.kid) throw new Error("Grant token rejected");
  const jwk = (keys || []).find((key) => key.kid === header.kid && key.kty === "OKP" && key.crv === "Ed25519");
  if (!jwk?.x) throw new Error("Grant token rejected");
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("Grant token rejected");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!claims.grant_id || !claims.hand || typeof claims.exp !== "number") throw new Error("Grant token rejected");
  if (claims.exp * 1000 <= Date.now()) throw new Error("Grant expired");
  return claims;
}

/**
 * @param {{ origin: string, token: string, hand: string, args: Record<string, unknown> }} input
 */
export async function assertGrantLocal(input) {
  const keys = await loadJwks(input.origin);
  const claims = verifyGrantToken(input.token, keys);
  if (claims.hand !== input.hand) throw new Error("Grant is for another hand");
  const why = localMismatch(input.hand, claims.constraints || {}, input.args || {});
  if (why) throw new Error(`Grant does not allow this ${why}`);
  return claims;
}

async function loadJwks(origin) {
  if (cache.keys && Date.now() - cache.at < 300_000) return cache.keys;
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/grants/jwks`);
  if (!response.ok) throw new Error("Could not read grant keys");
  const body = await response.json().catch(() => ({}));
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (!keys.length) throw new Error("Could not read grant keys");
  cache.at = Date.now();
  cache.keys = keys;
  return keys;
}

function localMismatch(hand, constraints, args) {
  if (hand === "git.push") {
    if (args.repo !== constraints.repo) return "repo";
    if (args.ref !== constraints.ref) return "ref";
    if (typeof constraints.commit_sha === "string" && args.commit_sha !== constraints.commit_sha) return "commit_sha";
    return null;
  }
  if (hand === "pay.x402") {
    const hosts = Array.isArray(constraints.hosts) ? constraints.hosts : [];
    let host = "";
    try {
      host = new URL(String(args.url || "")).hostname.toLowerCase();
    } catch {
      host = "";
    }
    if (!host || !hosts.includes(host)) return "host";
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(constraints.max_per_req)) return "amount";
    if (args.asset !== constraints.asset) return "asset";
    return null;
  }
  if (hand === "pay.ap2") {
    if (args.checkout_hash !== constraints.checkout_hash) return "checkout_hash";
    if (args.asset !== constraints.asset) return "asset";
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(constraints.max)) return "amount";
    return null;
  }
  return "hand";
}
