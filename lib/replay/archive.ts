import { REPLAY_CASE_A } from "./case-a";
import { txExplorerUrl } from "@/lib/gen/chain";

export type ReplayCase = {
  id: string;
  constitution: string;
  proposer: string;
  objector: string;
  kind: "book" | "message";
  asked: string;
  counter: string | null;
  decided: string;
  outcome: "allow_a" | "allow_b" | "remedy" | "escalate";
  objectionGrounded: boolean;
  judge: "onchain" | "offline";
  tx: string | null;
};

const recordedTx = process.env.NEXT_PUBLIC_REPLAY_TX?.trim() || null;

export const REPLAY_CASES: ReplayCase[] = [
  {
    id: "a",
    ...REPLAY_CASE_A,
    judge: recordedTx ? "onchain" : REPLAY_CASE_A.judge,
    tx: recordedTx,
  },
  {
    id: "b",
    constitution: REPLAY_CASE_A.constitution,
    proposer: "Travel",
    objector: "Calendar",
    kind: "book",
    asked: "Move the 9:00 client call to 11:00",
    counter: "Keep the 9:00 client call",
    decided: "Keep the 9:00 client call",
    outcome: "allow_b",
    objectionGrounded: true,
    judge: "offline",
    tx: null,
  },
  {
    id: "c",
    constitution: `${REPLAY_CASE_A.constitution} Security may block mail that looks like payment or other people's data.`,
    proposer: "Assistant",
    objector: "Security",
    kind: "message",
    asked: "Send the client spreadsheet with emails",
    counter: null,
    decided: "",
    outcome: "allow_b",
    objectionGrounded: true,
    judge: "offline",
    tx: null,
  },
  {
    id: "d",
    constitution: "Do not promise a client a deadline wider than the contract.",
    proposer: "Sales",
    objector: "Legal",
    kind: "message",
    asked: "Promise the client delivery next Friday",
    counter: "Reply without a hard delivery date",
    decided: "Reply without a hard delivery date",
    outcome: "allow_b",
    objectionGrounded: true,
    judge: "offline",
    tx: null,
  },
];

export function replayTxHref(tx: string | null) {
  return tx ? txExplorerUrl(tx) : null;
}
