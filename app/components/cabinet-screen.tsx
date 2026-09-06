import { eq } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { inboxForPrincipal } from "@/lib/protocol/actions";
import { doorStatsFor, type DoorStats } from "@/lib/protocol/report";
import { sweep } from "@/lib/protocol/sweep";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import type { Messages } from "@/lib/i18n/load";
import { CabinetWizard } from "@/app/components/cabinet-wizard";
import { parseCabinetTab, type CabinetTabId } from "@/app/components/cabinet-desk";
import { ConnectCard } from "@/app/components/connect-card";
import { TechCard } from "@/app/components/tech-card";
import { TreasuryCard } from "@/app/components/treasury-card";
import { RulesCard } from "@/app/components/rules-card";
import { AppealForm } from "@/app/components/appeal-form";
import { HouseSwitch } from "@/app/components/house-switch";
import { MembersCard } from "@/app/components/members-card";
import { TestClientsToggle } from "@/app/components/test-clients-toggle";
import { markHarnessProposers } from "@/lib/protocol/house-clients";
import { PagedList } from "@/app/components/paged-list";
import { StatusPill, outcomeTone, statusTone } from "@/app/components/status-pill";
import { WalletButton } from "@/app/components/wallet-button";
import { txExplorerUrl } from "@/lib/gen/chain";
import { canManage, canOperate, type HouseListing } from "@/lib/protocol/members";
import type { MemberRole } from "@/lib/protocol/types";

type FeedCopy = Messages["cabinet"];
type InboxItem = Awaited<ReturnType<typeof inboxForPrincipal>>["items"][number];

export async function CabinetScreen({
  locale,
  token,
  principal,
  memberRole = "owner",
  houses = [],
  viewerAddress = null,
  enroll,
  tab,
  t,
}: {
  locale: string;
  token: string;
  principal: HousePrincipal;
  memberRole?: MemberRole;
  houses?: HouseListing[];
  viewerAddress?: string | null;
  enroll?: string;
  tab?: string;
  t: Messages;
}) {
  await markHarnessProposers(principal.id);
  await sweep(principal.id, new Date(), { courts: 0 });
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principal.id));
  const inbox = await inboxForPrincipal(principal.id);
  const showTest = principal.testClients;
  const feedItems = showTest ? inbox.items : inbox.items.filter((item) => !item.test_pass);
  const visibleAgents = showTest ? houseAgents : houseAgents.filter((agent) => !agent.isGuardian);
  const testAgents = houseAgents.filter((agent) => agent.isGuardian);
  const door = await doorStatsFor(principal.id);
  const doorById = Object.fromEntries(door.map((row) => [row.agent_id, row]));
  const names = Object.fromEntries(houseAgents.map((agent) => [agent.id, agent.name]));
  const liveIds = liveAgentIds(feedItems);
  const hasGuardian = houseAgents.some((agent) => agent.isGuardian);
  const harnessDone = principal.wizardHarnessDone || hasGuardian || inbox.items.length > 0;
  const step = !principal.wizardRulesDone
    ? "rules"
    : !principal.wizardLockDone
      ? "lock"
      : !principal.wizardConnectDone && inbox.items.length === 0
        ? "connect"
        : !harnessDone && !hasGuardian
          ? "guardian"
          : !harnessDone && inbox.items.length === 0
            ? "first"
            : null;
  const now = Date.now();
  const signedIn = token === "me";
  const houseId = signedIn ? principal.id : undefined;
  const manage = canManage(memberRole);
  const operate = canOperate(memberRole);
  const tabIds: CabinetTabId[] = ["inbox", "treasury", "rules"];
  if (operate) tabIds.push("connect");
  if (signedIn && principal.type === "org" && !principal.isSpawn) tabIds.push("people");
  const currentTab = parseCabinetTab(tab, tabIds);
  const tabItems: { id: CabinetTabId; label: string }[] = [
    { id: "inbox", label: t.cabinet.inbox },
    { id: "treasury", label: t.cabinet.treasury },
    { id: "rules", label: t.cabinet.tabRules },
    ...(operate ? [{ id: "connect" as CabinetTabId, label: t.cabinet.tabConnect }] : []),
    ...(signedIn && principal.type === "org" && !principal.isSpawn
      ? [{ id: "people" as CabinetTabId, label: t.cabinet.members }]
      : []),
  ];

  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <div>
          <h1>{t.cabinet.kicker}</h1>
          {principal.isSpawn ? <p className="hint">{t.spawn.banner}</p> : null}
          {signedIn ? <HouseSwitch locale={locale} currentId={principal.id} houses={houses} t={t.cabinet} /> : null}
          {!manage ? <p className="hint">{t.cabinet.readOnly}</p> : null}
        </div>
        {signedIn ? (
          <WalletButton
            locale={locale}
            signOutLabel={t.cabinet.signOut}
            connectLabel={t.home.signIn}
            initialAddress={viewerAddress ?? principal.ownerAddress}
          />
        ) : null}
      </header>

      {step && !manage ? (
        <section className="cabinet-panel">
          <p className="hint">{t.cabinet.setupWait}</p>
        </section>
      ) : step ? (
        <section className="cabinet-panel">
          <CabinetWizard
            token={token}
            houseId={houseId}
            step={step}
            wizard={t.wizard}
            connect={t.connect}
            charter={t.charter}
            cabinetError={t.cabinet.error}
            constitution={principal.constitution}
            houseType={principal.type === "org" ? "org" : "personal"}
          />
        </section>
      ) : (
        <section className="cabinet-panel">
          {tabItems.map((item) => (
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
            {tabItems.map((item) => (
              <label key={item.id} className="segment" htmlFor={`cabinet-tab-${item.id}`}>
                {item.label}
              </label>
            ))}
          </nav>
          <div className="cabinet-scroll">
            <div data-cabinet-pane="inbox">
              {visibleAgents.length > 0 ? (
                <div className="agent-chips-block">
                  <ul className="agent-chips">
                    {visibleAgents.map((agent) => (
                      <li
                        key={agent.id}
                        className={liveIds.has(agent.id) || agent.isGuardian ? "agent-live" : "agent-wait"}
                        title={doorTitle(doorById[agent.id], t.cabinet)}
                      >
                        {agent.name}
                        {agent.isGuardian
                          ? ` · ${t.cabinet.guardian}`
                          : liveIds.has(agent.id)
                            ? ` · ${t.cabinet.agentLive}`
                            : ` · ${t.cabinet.agentWait}`}
                        {doorChip(doorById[agent.id], t.cabinet)}
                      </li>
                    ))}
                  </ul>
                  {visibleAgents.some((agent) => (doorById[agent.id]?.proposed ?? 0) > 0) ? (
                    <p className="hint door-hint">{t.cabinet.doorHint}</p>
                  ) : null}
                </div>
              ) : (
                <p className="empty">{t.cabinet.emptyAgents}</p>
              )}
              {operate && testAgents.length > 0 ? (
                <TestClientsToggle
                  token={token}
                  houseId={houseId}
                  on={showTest}
                  onLabel={t.cabinet.testClientsOn}
                  offLabel={t.cabinet.testClientsOff}
                  hint={t.cabinet.testClientsHint}
                  errorLabel={t.cabinet.error}
                />
              ) : null}
              {feedItems.length === 0 ? (
                <p className="empty">{t.cabinet.emptyInbox}</p>
              ) : (
                <PagedList
                  className="feed"
                  prevLabel={t.cabinet.pagePrev}
                  nextLabel={t.cabinet.pageNext}
                  pageOf={t.cabinet.pageOf}
                >
                  {feedItems.map((item) => (
                    <FeedRow
                      key={item.id}
                      item={item}
                      names={names}
                      t={t.cabinet}
                      appeal={t.appeal}
                      token={token}
                      houseId={houseId}
                      canAppeal={operate}
                      errorLabel={t.cabinet.error}
                      now={now}
                    />
                  ))}
                </PagedList>
              )}
            </div>
            <div data-cabinet-pane="treasury">
              <TreasuryCard
                token={token}
                houseId={houseId}
                canDeposit={operate}
                canManage={manage}
                t={t.cabinet}
                errorLabel={t.cabinet.error}
              />
            </div>
            <div data-cabinet-pane="rules">
              <RulesCard
                token={token}
                houseId={houseId}
                constitution={principal.constitution}
                canEdit={manage}
                enroll={enroll}
                enrollLabel={t.cabinet.enrollment}
                t={t.cabinet}
                errorLabel={t.cabinet.error}
              />
            </div>
            {operate ? (
              <div data-cabinet-pane="connect" className="stack">
                <ConnectCard
                  token={token}
                  houseId={houseId}
                  t={t.connect}
                  errorLabel={t.cabinet.error}
                  compact
                />
                <details>
                  <summary>{t.connect.advanced}</summary>
                  <TechCard token={token} houseId={houseId} t={t.tech} errorLabel={t.cabinet.error} />
                </details>
              </div>
            ) : null}
            {signedIn && principal.type === "org" && !principal.isSpawn ? (
              <div data-cabinet-pane="people">
                <MembersCard
                  token={token}
                  houseId={principal.id}
                  selfAddress={viewerAddress}
                  canInvite={manage}
                  asPanel
                  t={t.cabinet}
                  errorLabel={t.cabinet.error}
                />
              </div>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}

function FeedRow({
  item,
  names,
  t,
  appeal,
  token,
  houseId,
  canAppeal,
  errorLabel,
  now,
}: {
  item: InboxItem;
  names: Record<string, string>;
  t: FeedCopy;
  appeal: Messages["appeal"];
  token: string;
  houseId?: string;
  canAppeal: boolean;
  errorLabel: string;
  now: number;
}) {
  const proposer = names[item.proposer_id] ?? item.proposer_id;
  const kind = kindLabel(item.kind, t);
  const asked = formatAction(item.payload);
  const firstObjection = item.objections[0];
  const objector = firstObjection ? (names[firstObjection.objector_id] ?? firstObjection.objector_id) : null;
  const counter = firstObjection ? formatAction(firstObjection.counter_action) : "";
  const decided = decisionAction(item);
  const decision = decisionLine(item, t, decided, now);
  const held = Boolean(item.held_until && new Date(item.held_until).getTime() > now);
  const outcome = item.verdict?.outcome;

  return (
    <li className="feed-item">
      <StatusPill tone={statusTone(item.status, held, item.may_act)}>
        {statusLabel(item.status, t, held, item.may_act)}
      </StatusPill>
      <div className="feed-block">
        <p className="feed-label">{t.request}</p>
        <p>
          {proposer} · {kind}
          {asked ? `: ${asked}` : ""}
        </p>
      </div>
      {firstObjection ? (
        <div className="feed-block">
          <p className="feed-label">{t.objection}</p>
          <p>
            {objector}
            {counter ? `: ${counter}` : ""}
          </p>
        </div>
      ) : null}
      {decision ? (
        <div className="feed-block">
          <div className="feed-label-row">
            <p className="feed-label">{t.decision}</p>
            {outcome ? (
              <StatusPill tone={outcomeTone(outcome)}>{outcomeLabel(outcome, t)}</StatusPill>
            ) : null}
          </div>
          <p>{decision}</p>
          {held ? <p className="hint">{t.holdAppeal}</p> : null}
          {item.status === "permitted" ? (
            <p className="hint">{item.may_act ? t.mayAct : t.mustNot}</p>
          ) : null}
          {item.report ? <p className="hint">{reportLine(item.report.result, t)}</p> : null}
          {item.verdict?.judge === "onchain" && item.verdict.tx ? (
            <p className="hint">
              {t.judgeOnchain} <TxLink tx={item.verdict.tx} />
            </p>
          ) : item.verdict ? (
            <p className="hint">{t.judgeOffline}</p>
          ) : null}
        </div>
      ) : null}
      {canAppeal && item.case && item.appeal_until && new Date(item.appeal_until).getTime() > now ? (
        <div className="feed-block">
          <AppealForm
            token={token}
            houseId={houseId}
            caseId={item.case.id}
            t={appeal}
            errorLabel={errorLabel}
          />
        </div>
      ) : null}
    </li>
  );
}

function doorChip(stats: DoorStats | undefined, t: FeedCopy) {
  if (!stats || stats.proposed === 0) return null;
  const bits = [
    t.doorLine.replace("{asked}", String(stats.proposed)).replace("{did}", String(stats.did)),
  ];
  if (stats.broke > 0) bits.push(t.doorBroke.replace("{n}", String(stats.broke)));
  if (stats.pending > 0) bits.push(t.doorPending.replace("{n}", String(stats.pending)));
  return <span className="agent-door"> · {bits.join(" · ")}</span>;
}

function doorTitle(stats: DoorStats | undefined, t: FeedCopy) {
  if (!stats) return t.doorHint;
  return [
    t.doorLine.replace("{asked}", String(stats.proposed)).replace("{did}", String(stats.did)),
    stats.broke ? t.doorBroke.replace("{n}", String(stats.broke)) : "",
    stats.pending ? t.doorPending.replace("{n}", String(stats.pending)) : "",
    t.doorHint,
  ]
    .filter(Boolean)
    .join(" · ");
}

function reportLine(result: string, t: FeedCopy) {
  if (result === "broke") return t.reportBroke;
  if (result === "skipped") return t.reportSkipped;
  return t.reportDid;
}

function liveAgentIds(items: InboxItem[]) {
  const ids = new Set<string>();
  for (const item of items) {
    ids.add(item.proposer_id);
    for (const row of item.objections) ids.add(row.objector_id);
  }
  return ids;
}

function kindLabel(kind: string, t: FeedCopy) {
  if (kind === "book") return t.kindBook;
  if (kind === "spend") return t.kindSpend;
  if (kind === "message") return t.kindMessage;
  if (kind === "cancel") return t.kindCancel;
  return kind;
}

function outcomeLabel(outcome: string, t: FeedCopy) {
  if (outcome === "allow_a") return t.outcomeAllowA;
  if (outcome === "allow_b") return t.outcomeAllowB;
  if (outcome === "remedy") return t.outcomeRemedy;
  return t.outcomeEscalate;
}

function statusLabel(status: string, t: FeedCopy, held = false, mayAct?: boolean) {
  if (held) return t.statusHeld;
  if (status === "open") return t.statusOpen;
  if (status === "awaiting_ack") return t.statusAck;
  if (status === "permitted") return mayAct ? t.statusPermitted : t.statusDenied;
  if (status === "executed") return t.statusExecuted;
  if (status === "escalated") return t.statusEscalated;
  return status;
}

function decisionLine(item: InboxItem, t: FeedCopy, decided: string, now: number) {
  const verdict = item.verdict;
  if (!verdict) {
    if (item.status === "executed" || item.status === "permitted") return t.silence;
    if (item.status === "open") {
      // Objected and past the silence window: the court is the only thing left.
      const deadlocked =
        item.objections.length > 0 && new Date(item.silence_until).getTime() <= now;
      return deadlocked ? t.inCourt : t.waiting;
    }
    return null;
  }
  if (verdict.outcome === "allow_a") return t.allowA;
  if (verdict.outcome === "escalate") return t.escalate;
  if (verdict.outcome === "remedy") {
    return t.remedy.replace("{summary}", decided || "—");
  }
  if (decided) return t.allowBCounter.replace("{summary}", decided);
  return t.allowBBlock;
}

function decisionAction(item: InboxItem) {
  const verdict = item.verdict;
  if (!verdict) return "";
  if (verdict.outcome === "allow_a") return formatAction(item.payload);
  if (verdict.outcome === "remedy") return formatAction(verdict.remedy_action);
  if (verdict.outcome === "allow_b") return formatAction(item.objections[0]?.counter_action);
  return "";
}

function formatAction(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  let summary = typeof row.summary === "string" ? row.summary.trim() : "";
  const amount = typeof row.amount === "number" ? row.amount : null;
  const currency = typeof row.currency === "string" ? row.currency : "";
  if (amount == null) return summary.replace(/\s*\(compromise\)\s*/i, "").trim();
  const money = !currency || currency === "EUR" ? `€${amount}` : `${amount} ${currency}`;
  if (/€\s*[\d.,]+/.test(summary)) {
    summary = summary.replace(/€\s*[\d.,]+/, money);
  } else {
    summary = summary ? `${summary}, ${money}` : money;
  }
  return summary.replace(/\s*\(compromise\)\s*/i, "").trim();
}

function TxLink({ tx }: { tx: string }) {
  const href = txExplorerUrl(tx);
  const label = tx.length <= 18 ? tx : `${tx.slice(0, 10)}…${tx.slice(-6)}`;
  if (!href) return label;
  return (
    <a className="tx-link" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
