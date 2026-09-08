export type PillTone = "ok" | "warn" | "info" | "danger" | "neutral";

/** Small labelled dot. Copy always comes from the caller's catalog. */
export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Action status as shown at the top of a feed item. */
export function statusTone(status: string, held = false, mayAct?: boolean, phase?: string): PillTone {
  if (held) return "info";
  if (phase === "in_court") return "info";
  if (status === "permitted") return mayAct === false ? "info" : "ok";
  if (status === "executed") return "ok";
  if (status === "escalated") return "danger";
  if (status === "bargaining" || status === "awaiting_ack") return "warn";
  return "neutral";
}

/** Live court outcomes (yes / no / human). Old allow_b / remedy read as human. */
export function outcomeTone(outcome: string): PillTone {
  if (outcome === "allow_a" || outcome === "allow") return "ok";
  if (outcome === "deny") return "info";
  return "danger";
}
