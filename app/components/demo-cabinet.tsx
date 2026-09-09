import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { formatWhen } from "@/lib/i18n/when";
import { parseCabinetTab, type CabinetTabId } from "@/app/components/cabinet-desk";
import { ConnectCard } from "@/app/components/connect-card";
import { ContactsCard } from "@/app/components/contacts-card";
import { TreasuryCard } from "@/app/components/treasury-card";
import { RulesCard } from "@/app/components/rules-card";
import { PagedList } from "@/app/components/paged-list";
import { StatusPill, outcomeTone, statusTone } from "@/app/components/status-pill";
import { DEMO_CASES, DEMO_TOKEN, DEMO_TREASURY, demoConnect, type DemoCase } from "@/lib/demo/preview";

const TABS: { id: CabinetTabId; key: "inbox" | "treasury" | "tabRules" | "tabConnect" | "tabContacts" }[] = [
  { id: "inbox", key: "inbox" },
  { id: "treasury", key: "treasury" },
  { id: "rules", key: "tabRules" },
  { id: "contacts", key: "tabContacts" },
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
  const chips = demoAgentChips(t);

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
                  <li key={chip.name} className={chip.asked > 0 ? "agent-live" : "agent-wait"}>
                    {chip.name}
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
                <DemoFeedRow key={row.id} row={row} locale={locale} cabinet={t.cabinet} replay={t.replay} />
              ))}
            </PagedList>
          </div>
          <div data-cabinet-pane="treasury">
            <TreasuryCard
              token={DEMO_TOKEN}
              locale={locale}
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
          <div data-cabinet-pane="contacts">
            <ContactsCard
              token={DEMO_TOKEN}
              locale={locale}
              canEdit={false}
              locked
              preview={{ email: "demo@foyerapp.dev", email_verified: true, telegram: false }}
              t={t.cabinet}
              errorLabel={t.cabinet.error}
            />
          </div>
          <div data-cabinet-pane="connect" className="stack">
            <ConnectCard
              token={DEMO_TOKEN}
              t={t.connect}
              tech={t.tech}
              errorLabel={t.cabinet.error}
              compact
              preview={{ ...connect, name: t.replay.a.proposer }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function DemoFeedRow({
  row,
  locale,
  cabinet,
  replay,
}: {
  row: DemoCase;
  locale: Locale;
  cabinet: Messages["cabinet"];
  replay: Messages["replay"];
}) {
  const story = replay[row.id];
  const denied = row.outcome === "deny";
  const status =
    row.outcome === "escalate" ? cabinet.statusEscalated : denied ? cabinet.statusDenied : cabinet.statusPermitted;
  const tone =
    row.outcome === "escalate" ? statusTone("escalated") : statusTone("permitted", false, !denied);

  const objections = demoObjections(story);

  return (
    <li className="feed-item">
      <div className="feed-head">
        <StatusPill tone={tone}>{status}</StatusPill>
        <time className="feed-at" dateTime={row.at}>
          {formatWhen(row.at, locale)}
        </time>
      </div>
      <div className="feed-ask">
        <p className="feed-who">
          {story.proposer} · {kindLabel(row.kind, cabinet)}
        </p>
        <p className="feed-title">{story.asked}</p>
        {row.path === "revise" ? <p className="hint">{cabinet.revised.replace("{summary}", story.decided)}</p> : null}
      </div>
      {objections.length > 0 ? (
        <div className="feed-thread">
          <p className="feed-label">{objections.length > 1 ? cabinet.objections : cabinet.objection}</p>
          <ul>
            {objections.map((item) => (
              <li key={`${item.name}-${item.counter}`}>
                <p className="feed-voice">{item.name}</p>
                {item.counter ? <p className="hint">{cabinet.suggestion.replace("{summary}", item.counter)}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="feed-verdict">
        <div className="feed-verdict-row">
          <StatusPill tone={outcomeTone(row.outcome)}>{outcomeLabel(row.outcome, cabinet)}</StatusPill>
          <p>{decisionCopy(row, cabinet)}</p>
        </div>
        <ul className="feed-notes">
          <li>{resultCopy(row, replay)}</li>
        </ul>
      </div>
    </li>
  );
}

function demoObjections(story: Messages["replay"]["a"]) {
  const rows: { name: string; counter: string }[] = [];
  if (story.objector) rows.push({ name: story.objector, counter: story.counter });
  if (story.objector2) rows.push({ name: story.objector2, counter: story.counter2 });
  return rows;
}

function demoAgentChips(t: Messages) {
  const asked = new Map<string, number>();
  const did = new Map<string, number>();
  const names: string[] = [];
  for (const row of DEMO_CASES) {
    const story = t.replay[row.id];
    if (!names.includes(story.proposer)) names.push(story.proposer);
    for (const item of demoObjections(story)) {
      if (!names.includes(item.name)) names.push(item.name);
    }
    asked.set(story.proposer, (asked.get(story.proposer) ?? 0) + 1);
    if (row.outcome === "allow") {
      did.set(story.proposer, (did.get(story.proposer) ?? 0) + 1);
    }
  }
  return names.map((name) => ({
    name,
    asked: asked.get(name) ?? 0,
    did: did.get(name) ?? 0,
  }));
}

function kindLabel(kind: DemoCase["kind"], cabinet: Messages["cabinet"]) {
  if (kind === "book") return cabinet.kindBook;
  if (kind === "spend") return cabinet.kindSpend;
  return cabinet.kindMessage;
}

function outcomeLabel(outcome: DemoCase["outcome"], cabinet: Messages["cabinet"]) {
  if (outcome === "allow") return cabinet.outcomeAllowA;
  if (outcome === "deny") return cabinet.outcomeDeny;
  return cabinet.outcomeEscalate;
}

function decisionCopy(row: DemoCase, cabinet: Messages["cabinet"]) {
  if (row.path === "silence") return cabinet.silence;
  if (row.path === "revise") return cabinet.revisedSilence;
  if (row.outcome === "allow") return cabinet.allowA;
  if (row.outcome === "deny") return cabinet.deny;
  return cabinet.escalate;
}

function resultCopy(row: DemoCase, replay: Messages["replay"]) {
  if (row.outcome === "escalate") return replay.resultYou;
  if (row.outcome === "deny") return replay.resultNone;
  if (row.kind === "message") return replay.resultMessage;
  return replay.resultTx;
}
