import { createHash, randomBytes } from "node:crypto";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function mintToken(prefix: "agk" | "cab" | "enr" | "hou" | "agt"): string {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}
