import type { ActionPayload, EvidenceItem } from "@/lib/protocol/types";

/** Case D: Sales promises a date Legal says is wider than the contract. */
export const CASE_D = {
  kind: "message" as const,
  payload: {
    kind: "message",
    summary: "Promise the client delivery next Friday",
  } satisfies ActionPayload,
  justification: "The client asked for a hard date.",
  evidence: [
    { type: "text" as const, value: "Contract only allows 30-day delivery" },
  ] satisfies EvidenceItem[],
};
