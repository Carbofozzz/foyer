import type { grants } from "@/lib/db/schema";
import { grantSigningKeyConfigured, signGrantJwt, type GrantClaims } from "./jwt";

type GrantRow = typeof grants.$inferSelect;

export function tokenForGrant(row: GrantRow): string | null {
  if (!grantSigningKeyConfigured()) return null;
  if (row.status !== "active") return null;
  const claims: GrantClaims = {
    grant_id: row.id,
    action_id: row.actionId,
    agent_id: row.agentId,
    hand: row.hand,
    constraints: row.constraints,
    exp: Math.floor(row.expiresAt.getTime() / 1000),
    payload_hash: row.payloadHash,
  };
  return signGrantJwt(claims);
}
