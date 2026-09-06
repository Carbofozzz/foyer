import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { parseCabinetTab, type CabinetTabId } from "@/app/components/cabinet-desk";
import { ConnectCard } from "@/app/components/connect-card";
import { TechCard } from "@/app/components/tech-card";
import { TreasuryCard } from "@/app/components/treasury-card";
import { RulesCard } from "@/app/components/rules-card";
import { PagedList } from "@/app/components/paged-list";
import { StatusPill, outcomeTone, statusTone } from "@/app/components/status-pill";
import { DEMO_CASES, DEMO_TOKEN, DEMO_TREASURY, demoConnect, type DemoCase } from "@/lib/demo/preview";

const TABS: { id: CabinetTabId; key: "inbox" | "treasury" | "tabRules" | "tabConnect" }[] = [
  { id: "inbox", key: "inbox" },
  { id: "treasury", key: "treasury" },
  { id: "rules", key: "tabRules" },
  { id: "connect", key: "tabConnect" },
];

export function DemoCabinet({
  locale,
  tab,
  t,
}: {
  locale: Locale;
  tab?: string;
  t: Messages;
}) {
  const currentTab = parseCabinetTab(tab, TABS.map((item) => item.id));
  const connect = demoConnect();
  const constitution = `${t.charter.save} ${t.charter.promisesYes} ${t.charter.securityYes}`;
  const chips = [
    { name: t.replay.a.proposer, test: false },
    { name: t.replay.a.objector, test: true },
    { name: t.replay.b.objector, test: true },
    { name: t.replay.c.proposer, test: false },
    { name: t.replay.c.objector, test: true },
    { name: t.replay.d.proposer, test: false },
    { name: t.replay.d.objector, test: true },
  ];

  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <div>
          <h1>{t.cabinet.kicker}</h1>
          <p className="hint">{t.spawn.banner}</p>
        </div>
      </header>
      <section className="cabinet-panel">
        {TABS.map((item) => (
          <input
            key={item.id}
            className="cabinet-tab-radio"
            type="radio"
            name="cabinet-tab"
            id={`cabinet-tab-${item.id}`}
            defaultChecked={item.id === currentTab}
          />
        ))}
        <nav className="cabinet-tabs segmented" aria-label={t.cabinet.tabs}>
          {TABS.map((item) => (
            <label key={item.id} className="segment" htmlFor={`cabinet-tab-${item.id}`}>
              {t.cabinet[item.key]}
            </label>
          ))}
        </nav>
        <div className="cabinet-scroll">
          <div data-cabinet-pane="inbox">
            <div className="agent-chips-block">
              <ul className="agent-chips">
                {chips.map((chip) => (
                  <li key={chip.name} className={chip.test ? "agent-wait" : "agent-live"}>
                    {chip.name}
                    {chip.test ? ` · ${t.cabinet.guardian}` : ` · ${t.cabinet.agentLive}`}
                  </li>
                ))}
              </ul>
            </div>
            <PagedList
              className="feed"
              prevLabel={t.cabinet.pagePrev}
              nextLabel={t.cabinet.pageNext}
              pageOf={t.cabinet.pageOf}
            >
              {DEMO_CASES.map((row) => (
                <DemoFeedRow key={row.id} row={row} cabinet={t.cabinet} replay={t.replay} />
              ))}
            </PagedList>
          </div>
          <div data-cabinet-pane="treasury">
            <TreasuryCard
              token={DEMO_TOKEN}
              locked
              preview={DEMO_TREASURY}
              t={t.cabinet}
              errorLabel={t.cabinet.error}
            />
          </div>
          <div data-cabinet-pane="rules">
            <RulesCard
              token={DEMO_TOKEN}
              constitution={constitution}
              canEdit={false}
              locked
              t={t.cabinet}
              errorLabel={t.cabinet.error}
              enrollLabel={t.cabinet.enrollment}
            />
          </div>
          <div data-cabinet-pane="connect" className="stack">
            <ConnectCard
              token={DEMO_TOKEN}
              t={t.connect}
              errorLabel={t.cabinet.error}
              compact
              preview={connect}
            />
            <details>
              <summary>{t.connect.advanced}</summary>
              <TechCard token={DEMO_TOKEN} t={t.tech} errorLabel={t.cabinet.error} preview={connect} />
            </details>
          </div>
        </div>
      </section>
      <p>
        <a href={`/${locale}`}>{t.replay.home}</a>
      </p>
    </main>
  );
}

function DemoFeedRow({
  row,
  cabinet,
  replay,
}: {
  row: DemoCase;
  cabinet: Messages["cabinet"];
  replay: Messages["replay"];
}) {
  const story = replay[row.id];
  const denied = row.outcome === "allow_b" && !story.decided;
  const status =
    row.outcome === "escalate" ? cabinet.statusEscalated : denied ? cabinet.statusDenied : cabinet.statusPermitted;
  const tone =
    row.outcome === "escalate" ? statusTone("escalated") : statusTone("permitted", false, !denied);

  return (
    <li className="feed-item">
      <StatusPill tone={tone}>{status}</StatusPill>
      <div className="feed-block">
        <p className="feed-label">{cabinet.request}</p>
        <p>
          {story.proposer} · {kindLabel(row.kind, cabinet)}: {story.asked}
        </p>
      </div>
      {story.objector ? (
        <div className="feed-block">
          <p className="feed-label">{cabinet.objection}</p>
          <p>
            {story.objector}
            {story.counter ? `: ${story.counter}` : ""}
          </p>
        </div>
      ) : null}
      <div className="feed-block">
        <div className="feed-label-row">
          <p className="feed-label">{cabinet.decision}</p>
          <StatusPill tone={outcomeTone(row.outcome)}>{outcomeLabel(row.outcome, cabinet)}</StatusPill>
        </div>
        <p>{decisionCopy(row.outcome, story.decided, cabinet)}</p>
        <p className="hint">{resultCopy(row, story, replay)}</p>
      </div>
    </li>
  );
}

function kindLabel(kind: DemoCase["kind"], cabinet: Messages["cabinet"]) {
  if (kind === "book") return cabinet.kindBook;
  if (kind === "spend") return cabinet.kindSpend;
  return cabinet.kindMessage;
}

function outcomeLabel(outcome: DemoCase["outcome"], cabinet: Messages["cabinet"]) {
  if (outcome === "allow_a") return cabinet.outcomeAllowA;
  if (outcome === "allow_b") return cabinet.outcomeAllowB;
  if (outcome === "remedy") return cabinet.outcomeRemedy;
  return cabinet.outcomeEscalate;
}

function decisionCopy(outcome: DemoCase["outcome"], decided: string, cabinet: Messages["cabinet"]) {
  if (outcome === "allow_a") return cabinet.allowA;
  if (outcome === "remedy") return cabinet.remedy.replace("{summary}", decided);
  if (outcome === "escalate") return cabinet.escalate;
  if (decided) return cabinet.allowBCounter.replace("{summary}", decided);
  return cabinet.allowBBlock;
}

function resultCopy(row: DemoCase, story: Messages["replay"]["a"], replay: Messages["replay"]) {
  if (row.outcome === "escalate") return replay.resultYou;
  if (row.outcome === "allow_b" && !story.decided) return replay.resultNone;
  if (row.kind === "message") return replay.resultMessage;
  return replay.resultTx;
}
