import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { REPLAY_CASE_A } from "@/lib/replay/case-a";

export function ReplayView({
  locale,
  replay,
  cabinet,
}: {
  locale: Locale;
  replay: Messages["replay"];
  cabinet: Messages["cabinet"];
}) {
  const kind = cabinet.kindBook;
  return (
    <main>
      <p className="kicker">{replay.kicker}</p>
      <h1>{replay.title}</h1>
      <p className="lead">{replay.lead}</p>
      <p className="hint">{replay.banner}</p>

      <section className="card">
        <h2 className="section-title">{cabinet.constitution}</h2>
        <p className="charter">{REPLAY_CASE_A.constitution}</p>
      </section>

      <section className="card">
        <h2 className="section-title">{cabinet.inbox}</h2>
        <ul className="feed">
          <li className="feed-item">
            <p className="muted">{cabinet.statusExecuted}</p>
            <div className="feed-block">
              <p className="feed-label">{cabinet.request}</p>
              <p>
                {REPLAY_CASE_A.proposer} · {kind}: {REPLAY_CASE_A.asked}
              </p>
            </div>
            <div className="feed-block">
              <p className="feed-label">{cabinet.objection}</p>
              <p>
                {REPLAY_CASE_A.objector}: {REPLAY_CASE_A.counter}
              </p>
            </div>
            <div className="feed-block">
              <p className="feed-label">{cabinet.decision}</p>
              <p>{cabinet.remedy.replace("{summary}", REPLAY_CASE_A.decided)}</p>
              <p className="hint">{cabinet.judgeOffline}</p>
            </div>
          </li>
        </ul>
      </section>

      <p>
        <a href={`/${locale}`}>{replay.home}</a>
      </p>
    </main>
  );
}
