/** House wizard lock list only. Propose does not use kind. */
export const ACTION_KINDS = ["spend", "book", "message", "cancel"] as const;
export type KnownActionKind = (typeof ACTION_KINDS)[number];

/** Archive IC answers. New court writes COURT_OUTCOMES only. */
export const OUTCOMES = ["allow_a", "allow_b", "remedy", "escalate"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Live court answers (yes / no / human). */
export const COURT_OUTCOMES = ["allow", "deny", "escalate"] as const;
export type CourtOutcome = (typeof COURT_OUTCOMES)[number];

export type StoredOutcome = CourtOutcome | Outcome;

/** `hosted` is reserved on existing rows. New agents are outbound or callback only. */
export const WAKE_KINDS = ["outbound", "callback", "hosted"] as const;
export type WakeKind = (typeof WAKE_KINDS)[number];

export function isBidirectionalWake(wake: string): wake is "callback" {
  return wake === "callback";
}

export const ACTION_STATUSES = [
  "open",
  "bargaining",
  "withdrawn",
  "awaiting_ack",
  "permitted",
  "escalated",
  "executed",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Propose is revision 1. At most two revises. */
export const MAX_REVISION = 3;

/** After a final allow or deny the proposer must POST report (ack). */
export const REPORT_ACK_SEC = 300;

export const WAKE_STATUSES = ["pending", "delivered", "failed"] as const;
export type WakeStatus = (typeof WAKE_STATUSES)[number];

export const PRINCIPAL_TYPES = ["personal", "org"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

/** Wallet roles inside one house. Same SIWE login — not a second account. */
export const MEMBER_ROLES = ["owner", "operator", "observer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const INVITE_ROLES = ["operator", "observer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const JUDGES = ["onchain", "offline"] as const;
export type Judge = (typeof JUDGES)[number];

export type ActionPayload = {
  summary: string;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
};

export type EvidenceItem = {
  type: "text" | "link" | "stub";
  value: string;
};

export type JudgeInput = {
  constitution: string;
  proposed_action: ActionPayload;
  objections: ObjectionOpinion[];
  evidence: EvidenceItem[];
};

export type VerdictAnswer = {
  outcome: CourtOutcome;
  remedy_action: ActionPayload | null;
  reasoning: string;
  objection_grounded: boolean;
};

/** One objector’s opinion for bargain and for the IC packet. */
export type ObjectionOpinion = {
  objector_id: string;
  justification: string;
  counter_action: ActionPayload | null;
};
