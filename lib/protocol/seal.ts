import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function sealSecret(): Buffer {
  const material = process.env.CRON_SECRET || process.env.DATABASE_URL || "foyer-dev-seal";
  return createHash("sha256").update(material).digest();
}

/** Encrypt a plaintext agent key so a tick can wake house-owned clients. */
export function sealKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealSecret(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function unsealKey(sealed: string): string {
  const buf = Buffer.from(sealed, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", sealSecret(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
