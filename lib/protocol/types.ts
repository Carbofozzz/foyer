export const ACTION_KINDS = ["spend", "book", "message", "cancel"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const OUTCOMES = ["allow_a", "allow_b", "remedy", "escalate"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PRINCIPAL_TYPES = ["personal", "org"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export const JUDGES = ["onchain", "offline"] as const;
export type Judge = (typeof JUDGES)[number];

/** Each kind declares whether execute can run before the appeal window closes. */
export const KIND_REVERSIBLE: Record<ActionKind, boolean> = {
  spend: true,
  book: true,
  message: true,
  cancel: true,
};

export type ActionPayload = {
  kind: ActionKind;
  summary: string;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
};

export type EvidenceItem = {
  type: "text" | "link" | "stub";
  value: string;
};

export type VerdictAnswer = {
  outcome: Outcome;
  remedy_action: ActionPayload | null;
  reasoning: string;
  objection_grounded: boolean;
};
