/** Exact `verdicts.reasoning` strings for offline escalate. Keep in sync with court + wake. */
export const REASON_HOOK_FAILED = "A required checker POST did not return 2xx.";
export const REASON_BARGAIN_TIMEOUT = "Bargain timed out without insist.";
export const REASON_NO_FEE = "The house wallet cannot pay the court fee, so the court never ran.";
export const REASON_SUBMIT_FAIL = "The court transaction could not be submitted after several attempts.";
export const REASON_TX_ERROR = "The court transaction finalized with an error too many times.";

export type NotifyReasonKey = "hookFailed" | "bargainTimeout" | "noFee" | "submitFail" | "txError" | "courtAsked";

export function notifyReasonKey(reasoning: string, judge: string): NotifyReasonKey {
  if (reasoning === REASON_HOOK_FAILED) return "hookFailed";
  if (reasoning === REASON_BARGAIN_TIMEOUT) return "bargainTimeout";
  if (reasoning === REASON_NO_FEE) return "noFee";
  if (reasoning === REASON_SUBMIT_FAIL) return "submitFail";
  if (reasoning === REASON_TX_ERROR) return "txError";
  if (judge === "onchain") return "courtAsked";
  return "courtAsked";
}
