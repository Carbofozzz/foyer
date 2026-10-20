import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export type GrantClaims = {
  grant_id: string;
  action_id: string;
  agent_id: string;
  hand: string;
  constraints: Record<string, unknown>;
  exp: number;
  payload_hash: string;
};

export function grantSigningKeyConfigured(): boolean {
  return Boolean(process.env.FOYER_GRANT_SIGNING_KEY?.trim());
}

export function signGrantJwt(claims: GrantClaims): string {
  const { privateKey, kid } = loadKey();
  const header = b64url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const input = `${header}.${payload}`;
  const sig = sign(null, Buffer.from(input), privateKey);
  return `${input}.${b64url(sig)}`;
}

export function verifyGrantJwt(token: string): GrantClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed grant");
  const { publicKey, kid } = loadKey();
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "EdDSA" || header.kid !== kid) throw new Error("bad grant header");
  const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("bad grant signature");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GrantClaims;
  if (!claims.grant_id || !claims.hand || typeof claims.exp !== "number") throw new Error("bad grant claims");
  return claims;
}

export function grantJwks(): { keys: Array<Record<string, string>> } {
  const { publicKey, kid } = loadKey();
  const raw = publicRaw(publicKey);
  return {
    keys: [
      {
        kty: "OKP",
        crv: "Ed25519",
        alg: "EdDSA",
        use: "sig",
        kid,
        x: b64url(raw),
      },
    ],
  };
}

function loadKey(): { privateKey: KeyObject; publicKey: KeyObject; kid: string } {
  const seedB64 = process.env.FOYER_GRANT_SIGNING_KEY?.trim();
  if (!seedB64) throw new Error("FOYER_GRANT_SIGNING_KEY is not set");
  const seed = Buffer.from(seedB64, "base64url");
  if (seed.length !== 32) throw new Error("FOYER_GRANT_SIGNING_KEY must be 32 bytes, base64url");
  const pkcs8 = Buffer.concat([PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const kid = createHash("sha256").update(publicRaw(publicKey)).digest("base64url").slice(0, 12);
  return { privateKey, publicKey, kid };
}

function publicRaw(publicKey: KeyObject): Buffer {
  const der = publicKey.export({ format: "der", type: "spki" });
  return der.subarray(der.length - 32);
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
