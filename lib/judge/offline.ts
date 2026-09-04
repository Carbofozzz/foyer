import type { ActionPayload, EvidenceItem, VerdictAnswer } from "@/lib/protocol/types";

export type JudgeInput = {
  constitution: string;
  proposed_action: ActionPayload;
  objection: {
    justification: string;
    counter_action: ActionPayload | null;
  } | null;
  evidence: EvidenceItem[];
};

const SAVE = /save|econom|budget|cheap|ahorr|spar|tasarruf|эконом/i;
const LATE_CHARTER = /late|client|work|present|tarde|cliente|trabajo|spät|kunde|arbeit|geç|müşteri|опозда|клиент|работ|презентац/i;
const LATE_EVIDENCE = /late|client|present|9:00|tarde|cliente|spät|geç|опозда|клиент|презентац/i;
const SECURITY = /security|data|payment|block|seguridad|daten|zahlung|güvenlik|безопасн|платеж|данн/i;

/**
 * Deterministic offline judge. Honest `judge: offline` — not consensus.
 * Day 5 replaces this call site with GenLayer; the answer shape stays the same.
 */
export function judgeOffline(input: JudgeInput): VerdictAnswer {
  const charter = input.constitution.trim();
  if (!charter || /contradict|silent|no rule|противореч|молчалив/i.test(charter)) {
    return {
      outcome: "escalate",
      remedy_action: null,
      reasoning: "The constitution is silent or contradictory on this dispute.",
      objection_grounded: false,
    };
  }

  if (!input.objection) {
    return {
      outcome: "allow_a",
      remedy_action: null,
      reasoning: "No objection was filed; the proposal stands.",
      objection_grounded: false,
    };
  }

  const citesCharter = mentionsCharter(input.objection.justification, charter);
  const proposal = input.proposed_action;
  const counter = input.objection.counter_action;

  if (counter && cheaper(counter, proposal) && SAVE.test(charter)) {
    if (LATE_CHARTER.test(charter) && LATE_EVIDENCE.test(joinedEvidence(input.evidence))) {
      return {
        outcome: "remedy",
        remedy_action: {
          kind: counter.kind,
          summary: `${counter.summary} (compromise)`,
          amount: midpoint(proposal.amount, counter.amount),
          currency: counter.currency ?? proposal.currency,
        },
        reasoning: "Neither extreme follows the charter best; a middle action does.",
        objection_grounded: true,
      };
    }
    return {
      outcome: "allow_b",
      remedy_action: null,
      reasoning: "The counter-action follows the constitution better than the proposal.",
      objection_grounded: true,
    };
  }

  if (!counter && SECURITY.test(charter) && citesCharter) {
    return {
      outcome: "allow_b",
      remedy_action: null,
      reasoning: "The objection is a grounded block; nothing is executed.",
      objection_grounded: true,
    };
  }

  if (citesCharter) {
    return {
      outcome: "allow_b",
      remedy_action: null,
      reasoning: "The objection is grounded; the proposal does not proceed.",
      objection_grounded: true,
    };
  }

  return {
    outcome: "allow_a",
    remedy_action: null,
    reasoning: "The objection is not grounded in the constitution.",
    objection_grounded: false,
  };
}

function mentionsCharter(justification: string, constitution: string): boolean {
  const words = constitution
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 4);
  const text = justification.toLowerCase();
  return words.some((word) => text.includes(word));
}

function cheaper(a: ActionPayload, b: ActionPayload): boolean {
  if (typeof a.amount !== "number" || typeof b.amount !== "number") return false;
  return a.amount < b.amount;
}

function midpoint(a?: number, b?: number): number | undefined {
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  return Math.round((a + b) / 2);
}

function joinedEvidence(evidence: EvidenceItem[]): string {
  return evidence.map((item) => item.value).join(" ");
}
