/** Exact `verdicts.reasoning` strings for offline escalate. Keep in sync with court + wake. */
export const REASON_HOOK_FAILED = "A required checker POST did not return 2xx.";
export const REASON_BARGAIN_TIMEOUT = "Bargain timed out without insist.";
export const REASON_NO_FEE = "The house wallet cannot pay the court fee, so the court never ran.";
export const REASON_SUBMIT_FAIL = "The court transaction could not be submitted after several attempts.";
export const REASON_TX_ERROR = "The court transaction finalized with an error too many times.";
export const REASON_GUARDIAN_FAILED = "The guardian call did not return a review.";
export const REASON_GUARDIAN_UNSURE = "The guardian could not ground an answer in the rules.";
export const REASON_GUARDIAN_NO_RULES = "The house has no rules, so the guardian did not review.";
export const REASON_GUARDIAN_NO_CREDIT = "The house has no guardian reactions left.";

export type NotifyReasonKey =
  | "hookFailed"
  | "bargainTimeout"
  | "noFee"
  | "submitFail"
  | "txError"
  | "courtAsked"
  | "guardianFailed";

export const NOTIFY_REASON_KEYS: readonly NotifyReasonKey[] = [
  "hookFailed",
  "bargainTimeout",
  "noFee",
  "submitFail",
  "txError",
  "courtAsked",
  "guardianFailed",
];

export function isNotifyReason(raw: unknown): raw is NotifyReasonKey {
  return typeof raw === "string" && (NOTIFY_REASON_KEYS as readonly string[]).includes(raw);
}

export function notifyReasonKey(reasoning: string, judge: string): NotifyReasonKey {
  if (reasoning === REASON_HOOK_FAILED) return "hookFailed";
  if (reasoning === REASON_BARGAIN_TIMEOUT) return "bargainTimeout";
  if (reasoning === REASON_NO_FEE) return "noFee";
  if (reasoning === REASON_SUBMIT_FAIL) return "submitFail";
  if (reasoning === REASON_TX_ERROR) return "txError";
  if (
    reasoning === REASON_GUARDIAN_FAILED ||
    reasoning === REASON_GUARDIAN_UNSURE ||
    reasoning === REASON_GUARDIAN_NO_RULES ||
    reasoning === REASON_GUARDIAN_NO_CREDIT
  ) {
    return "guardianFailed";
  }
  if (judge === "onchain") return "courtAsked";
  return "courtAsked";
}
