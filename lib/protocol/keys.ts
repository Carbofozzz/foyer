import { createHash, randomBytes } from "node:crypto";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type TokenPrefix = "agk" | "cab" | "enr" | "hou" | "agt" | "act" | "obj" | "cas" | "vrd" | "exe";

export function mintToken(prefix: TokenPrefix): string {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}
