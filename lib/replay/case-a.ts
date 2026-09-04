/** Frozen Case A for the public Replay. Not a live house. */

export const REPLAY_CASE_A = {
  constitution:
    "Save money, except being late for work or losing a client. External promises outrank internal convenience.",
  proposer: "Travel",
  objector: "Budget",
  kind: "book" as const,
  asked: "Business class, €420",
  counter: "Economy, €180",
  decided: "Economy, €300",
  outcome: "remedy" as const,
  objectionGrounded: true,
  judge: "offline" as const,
  tx: null,
};
