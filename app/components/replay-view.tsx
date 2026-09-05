import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { REPLAY_CASES, replayTxHref } from "@/lib/replay/archive";

export function ReplayView({
  locale,
  replay,
  cabinet,
}: {
  locale: Locale;
  replay: Messages["replay"];
  cabinet: Messages["cabinet"];
}) {
  return (
    <main>
      <p className="kicker">{replay.kicker}</p>
      <h1>{replay.title}</h1>
      <p className="lead">{replay.lead}</p>
      <p className="hint">{replay.banner}</p>

      {REPLAY_CASES.map((row) => (
        <section key={row.id} className="card">
          <h2 className="section-title">
            {replay.caseLabel.replace("{id}", row.id.toUpperCase())}
          </h2>
          <p className="charter">{row.constitution}</p>
          <ul className="feed">
            <li className="feed-item">
              <p className="muted">{cabinet.statusExecuted}</p>
              <div className="feed-block">
                <p className="feed-label">{cabinet.request}</p>
                <p>
                  {row.proposer} · {row.kind === "book" ? cabinet.kindBook : cabinet.kindMessage}: {row.asked}
                </p>
              </div>
              <div className="feed-block">
                <p className="feed-label">{cabinet.objection}</p>
                <p>
                  {row.objector}
                  {row.counter ? `: ${row.counter}` : ""}
                </p>
              </div>
              <div className="feed-block">
                <p className="feed-label">{cabinet.decision}</p>
                <p>{decisionCopy(row.outcome, row.decided, cabinet)}</p>
                {row.judge === "onchain" && row.tx ? (
                  <p className="hint">
                    {cabinet.judgeOnchain} <ReplayTx tx={row.tx} />
                  </p>
                ) : (
                  <p className="hint">{cabinet.judgeOffline}</p>
                )}
              </div>
            </li>
          </ul>
        </section>
      ))}

      <p>
        <a href={`/${locale}`}>{replay.home}</a>
      </p>
    </main>
  );
}

function decisionCopy(
  outcome: "allow_a" | "allow_b" | "remedy" | "escalate",
  decided: string,
  cabinet: Messages["cabinet"],
) {
  if (outcome === "allow_a") return cabinet.allowA;
  if (outcome === "remedy") return cabinet.remedy.replace("{summary}", decided);
  if (outcome === "escalate") return cabinet.escalate;
  if (decided) return cabinet.allowBCounter.replace("{summary}", decided);
  return cabinet.allowBBlock;
}

function ReplayTx({ tx }: { tx: string }) {
  const href = replayTxHref(tx);
  const label = tx.length <= 18 ? tx : `${tx.slice(0, 10)}…${tx.slice(-6)}`;
  if (!href) return label;
  return (
    <a className="tx-link" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
