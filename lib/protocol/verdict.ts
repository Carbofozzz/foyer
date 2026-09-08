import type { ActionPayload, CourtOutcome } from "./types";
import { COURT_OUTCOMES } from "./types";

/** Map a stored or on-chain outcome onto the live three. Old allow_b / remedy escalate honestly. */
export function normalizeCourtOutcome(raw: string): CourtOutcome | null {
  const outcome = raw.trim().toLowerCase();
  if (outcome === "allow" || outcome === "allow_a") return "allow";
  if (outcome === "deny") return "deny";
  if (outcome === "escalate") return "escalate";
  if (outcome === "allow_b" || outcome === "remedy") return "escalate";
  return null;
}

/** What the gateway permits after ack. Never someone’s counter_action. */
export function payloadForOutcome(outcome: string, proposed: ActionPayload): ActionPayload | null | "escalate" {
  const live = normalizeCourtOutcome(outcome);
  if (live === "allow") return proposed;
  if (live === "deny") return null;
  return "escalate";
}

export function isCourtOutcome(value: string): value is CourtOutcome {
  return (COURT_OUTCOMES as readonly string[]).includes(value);
}
