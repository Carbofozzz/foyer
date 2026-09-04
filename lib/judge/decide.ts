import type { Judge, JudgeInput, VerdictAnswer } from "@/lib/protocol/types";
import { ensureHouseWallet } from "./house-wallet";
import { judgeOnchain, type JudgeExtra } from "./onchain";
import type { HousePrincipal } from "@/lib/protocol/bundle";

export type JudgeDecision = {
  answer: VerdictAnswer;
  judge: Judge;
  tx: string | null;
};

const NO_COURT: VerdictAnswer = {
  outcome: "escalate",
  remedy_action: null,
  reasoning: "The court did not return a verdict.",
  objection_grounded: false,
};

/** GenLayer signed by the house wallet, or escalate. No local verdict. */
export async function decide(
  principal: HousePrincipal,
  caseId: string,
  input: JudgeInput,
  extra: JudgeExtra | undefined,
  contractAddress: string | null,
): Promise<JudgeDecision> {
  if (contractAddress) {
    const wallet = await ensureHouseWallet(principal);
    const onchain = await judgeOnchain(wallet.accountKey, contractAddress, caseId, input, extra);
    if (onchain) return { answer: onchain.answer, judge: "onchain", tx: onchain.tx };
  }
  return { answer: NO_COURT, judge: "offline", tx: null };
}
