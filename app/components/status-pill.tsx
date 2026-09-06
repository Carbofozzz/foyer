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
export function statusTone(status: string, held = false, mayAct?: boolean): PillTone {
  if (held) return "info";
  if (status === "permitted") return mayAct === false ? "info" : "ok";
  if (status === "executed") return "ok";
  if (status === "escalated") return "danger";
  if (status === "awaiting_ack") return "warn";
  return "neutral";
}

/** The four court outcomes. */
export function outcomeTone(outcome: string): PillTone {
  if (outcome === "allow_a") return "ok";
  if (outcome === "allow_b") return "info";
  if (outcome === "remedy") return "warn";
  return "danger";
}
