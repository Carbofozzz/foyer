import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { inboxForPrincipal } from "@/lib/protocol/actions";
import { doorStatsFor, type DoorStats } from "@/lib/protocol/report";
import { sweep } from "@/lib/protocol/sweep";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import type { Messages } from "@/lib/i18n/load";
import { formatWhen } from "@/lib/i18n/when";
import { CabinetSetup } from "@/app/components/cabinet-wizard";
import { parseCabinetTab, type CabinetTabId } from "@/app/components/cabinet-desk";
import { ConnectCard } from "@/app/components/connect-card";
import { ContactsCard } from "@/app/components/contacts-card";
import { TreasuryCard } from "@/app/components/treasury-card";
import { RulesCard } from "@/app/components/rules-card";
import { AppealForm } from "@/app/components/appeal-form";
import { HouseSwitch } from "@/app/components/house-switch";
import { MembersCard } from "@/app/components/members-card";
import { TestStageCard } from "@/app/components/test-stage-card";
import { InboxFeed } from "@/app/components/inbox-feed";
import { CabinetInboxRefresh } from "@/app/components/cabinet-inbox-refresh";
import { StatusPill, outcomeTone, statusTone } from "@/app/components/status-pill";
import { WalletButton } from "@/app/components/wallet-button";
import { txExplorerUrl } from "@/lib/gen/chain";
import { canManage, canOperate, type HouseListing } from "@/lib/protocol/members";
import type { MemberRole } from "@/lib/protocol/types";
import { notifyReasonKey } from "@/lib/notify/reasons";

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
  await sweep(principal.id, new Date(), { courts: 0, wakes: false, outbox: false });
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principal.id));
  const inbox = await inboxForPrincipal(principal.id);
  const leftoverIds = new Set(houseAgents.filter((agent) => agent.isGuardian).map((agent) => agent.id));
  const feedItems = inbox.items.filter(
    (item) =>
      !leftoverIds.has(item.proposer_id) && !item.objections.some((row) => leftoverIds.has(row.objector_id)),
  );
  const hideTest = feedItems.map((item) => item.test_pass);
  const liveIds = liveAgentIds(feedItems.filter((item) => !item.test_pass));
  const visibleAgents = houseAgents.filter((agent) => !agent.isGuardian);
  const door = await doorStatsFor(principal.id);
  const doorById = Object.fromEntries(door.map((row) => [row.agent_id, row]));
  const names = Object.fromEntries(houseAgents.map((agent) => [agent.id, agent.name]));
  const now = Date.now();
  const signedIn = token === "me";
  const houseId = signedIn ? principal.id : undefined;
  const manage = canManage(memberRole);
  const operate = canOperate(memberRole);
  const tabIds: CabinetTabId[] = ["inbox", "treasury", "rules"];
  if (manage) tabIds.push("contacts");
  if (operate) tabIds.push("connect", "test");
  if (signedIn && principal.type === "org" && !principal.isSpawn) tabIds.push("people");
  const currentTab = parseCabinetTab(tab, tabIds);
  const tabItems: { id: CabinetTabId; label: string }[] = [
    { id: "inbox", label: t.cabinet.inbox },
    { id: "treasury", label: t.cabinet.treasury },
    { id: "rules", label: t.cabinet.tabRules },
    ...(manage ? [{ id: "contacts" as CabinetTabId, label: t.cabinet.tabContacts }] : []),
    ...(operate
      ? [
          { id: "connect" as CabinetTabId, label: t.cabinet.tabConnect },
          { id: "test" as CabinetTabId, label: t.cabinet.tabTest },
        ]
      : []),
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
        {signedIn || manage ? (
          <div className="cabinet-head-actions">
            {manage ? (
              <CabinetSetup
                token={token}
                houseId={houseId}
                openOnMount={!principal.wizardConnectDone}
                wizard={t.wizard}
                connect={t.connect}
                charter={t.charter}
                cabinet={t.cabinet}
                cabinetError={t.cabinet.error}
                constitution={principal.constitution}
                houseType={principal.type === "org" ? "org" : "personal"}
                email={principal.contactEmail ?? ""}
                locale={locale}
              />
            ) : null}
            {signedIn ? (
              <WalletButton
                locale={locale}
                signOutLabel={t.cabinet.signOut}
                connectLabel={t.home.signIn}
                initialAddress={viewerAddress ?? principal.ownerAddress}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="cabinet-panel" data-cabinet-ready="">
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
        <CabinetInboxRefresh token={token} houseId={houseId} />
          <nav className="cabinet-tabs segmented" aria-label={t.cabinet.tabs}>
            {tabItems.map((item) => (
              <label key={item.id} className="segment" htmlFor={`cabinet-tab-${item.id}`}>
                {item.label}
              </label>
            ))}
          </nav>
          <div className="cabinet-scroll">
            <div data-cabinet-pane="inbox">
              <InboxFeed
                chips={
                  visibleAgents.length > 0 ? (
                    <ul className="agent-chips">
                      {visibleAgents.map((agent) => (
                        <li
                          key={agent.id}
                          className={liveIds.has(agent.id) ? "agent-live" : "agent-wait"}
                          title={[
                            doorTitle(doorById[agent.id], t.cabinet),
                            agent.wake === "callback"
                              ? agent.callbackUrl && agent.sealedCallbackSecret
                                ? t.connect.hookOk
                                : t.connect.hookMissing
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          {agent.name}
                          {agent.wake === "callback"
                            ? ` · ${t.connect.wakeCallback}`
                            : agent.wake === "hosted"
                              ? ` · ${t.connect.wakeHosted}`
                              : ` · ${t.connect.wakeOutbound}`}
                        </li>
                      ))}
                    </ul>
                  ) : null
                }
                testPass={hideTest}
                showToggle={hideTest.some(Boolean)}
                empty={t.cabinet.emptyInbox}
                showLabel={t.cabinet.testRecordsOn}
                hideLabel={t.cabinet.testRecordsOff}
                prevLabel={t.cabinet.pagePrev}
                nextLabel={t.cabinet.pageNext}
                pageOf={t.cabinet.pageOf}
              >
                {feedItems.map((item) => (
                  <FeedRow
                    key={item.id}
                    item={item}
                    names={names}
                    leftoverIds={leftoverIds}
                    t={t.cabinet}
                    notify={t.notify}
                    appeal={t.appeal}
                    token={token}
                    houseId={houseId}
                    canAppeal={operate}
                    errorLabel={t.cabinet.error}
                    now={now}
                    locale={locale}
                  />
                ))}
              </InboxFeed>
            </div>
            <div data-cabinet-pane="treasury">
              <TreasuryCard
                token={token}
                houseId={houseId}
                locale={locale}
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
            {manage ? (
              <div data-cabinet-pane="contacts">
                <ContactsCard
                  token={token}
                  houseId={houseId}
                  locale={locale}
                  canEdit={manage}
                  t={t.cabinet}
                  errorLabel={t.cabinet.error}
                />
              </div>
            ) : null}
            {operate ? (
              <div data-cabinet-pane="connect">
                <ConnectCard
                  token={token}
                  houseId={houseId}
                  t={t.connect}
                  tech={t.tech}
                  errorLabel={t.cabinet.error}
                  compact
                />
              </div>
            ) : null}
            {operate ? (
              <div data-cabinet-pane="test">
                <TestStageCard
                  token={token}
                  houseId={houseId}
                  t={t.cabinet}
                  errorLabel={t.cabinet.error}
                />
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
    </main>
  );
}

function FeedRow({
  item,
  names,
  leftoverIds,
  t,
  notify,
  appeal,
  token,
  houseId,
  canAppeal,
  errorLabel,
  now,
  locale,
}: {
  item: InboxItem;
  names: Record<string, string>;
  leftoverIds: Set<string>;
  t: FeedCopy;
  notify: Messages["notify"];
  appeal: Messages["appeal"];
  token: string;
  houseId?: string;
  canAppeal: boolean;
  errorLabel: string;
  now: number;
  locale: string;
}) {
  const proposer = agentLine(item.proposer_id, names, leftoverIds, t);
  const asked = formatAction(item.payload);
  const decision = decisionLine(item, t, notify);
  const held = Boolean(item.held_until && new Date(item.held_until).getTime() > now);
  const outcome = item.verdict?.outcome;
  const courtTx = item.verdict?.tx || item.case?.tx;
  const notes: ReactNode[] = [];
  if (held) notes.push(t.holdAppeal);
  if (item.report) {
    notes.push(t.reportDid);
  } else if (item.status === "permitted") {
    notes.push(reportAckLate(item) ? t.reportMiss : t.reportPending);
  }
  if (item.verdict?.judge === "onchain" && courtTx) {
    notes.push(
      <>
        {t.judgeOnchain} <TxLink tx={courtTx} />
      </>,
    );
  } else if (item.case?.tx) {
    notes.push(
      <>
        {t.courtTx} <TxLink tx={item.case.tx} />
      </>,
    );
  } else if (item.verdict && showOfflineCourtNote(item)) {
    notes.push(t.judgeOffline);
  }

  return (
    <li className="feed-item">
      <div className="feed-head">
        <StatusPill tone={statusTone(item.status, held, item.may_act, item.phase)}>
          {statusLabel(item.status, t, held, item.may_act, item.phase)}
        </StatusPill>
        <time className="feed-at" dateTime={item.created_at}>
          {formatWhen(item.created_at, locale)}
        </time>
      </div>
      <div className="feed-ask">
        <p className="feed-who">
          {proposer}
          {item.revision > 1 ? ` · ${t.revision.replace("{n}", String(item.revision))}` : ""}
        </p>
        <p className="feed-title">{asked || t.request}</p>
      </div>
      {item.objections.length > 0 ? (
        <div className="feed-thread">
          <p className="feed-label">{item.objections.length > 1 ? t.objections : t.objection}</p>
          <ul>
            {item.objections.map((row) => {
              const objector = agentLine(row.objector_id, names, leftoverIds, t);
              const text = typeof row.justification === "string" ? row.justification.trim() : "";
              const counter = formatAction(row.counter_action);
              return (
                <li key={row.id}>
                  <p>
                    <span className="feed-voice">{objector}</span>
                    {text ? <span className="feed-said"> — {text}</span> : null}
                  </p>
                  {counter ? <p className="hint">{t.suggestion.replace("{summary}", counter)}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {decision ? (
        <div className="feed-verdict">
          <div className="feed-verdict-row">
            {outcome ? <StatusPill tone={outcomeTone(outcome)}>{outcomeLabel(outcome, t)}</StatusPill> : null}
            <p>{decision}</p>
          </div>
          {notes.length > 0 ? (
            <ul className="feed-notes">
              {notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {canAppeal && item.case && item.status === "escalated" ? (
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

function agentLine(id: string, names: Record<string, string>, leftoverIds: Set<string>, t: FeedCopy) {
  const name = names[id] ?? id;
  return leftoverIds.has(id) ? `${name} · ${t.guardian}` : name;
}

function doorTitle(stats: DoorStats | undefined, t: FeedCopy) {
  if (!stats || stats.proposed === 0) return "";
  return [
    t.doorLine.replace("{asked}", String(stats.proposed)).replace("{did}", String(stats.did)),
    stats.broke ? t.doorBroke.replace("{n}", String(stats.broke)) : "",
    stats.pending ? t.doorPending.replace("{n}", String(stats.pending)) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function liveAgentIds(items: InboxItem[]) {
  const ids = new Set<string>();
  for (const item of items) {
    ids.add(item.proposer_id);
    for (const row of item.objections) ids.add(row.objector_id);
  }
  return ids;
}

function outcomeLabel(outcome: string, t: FeedCopy) {
  if (outcome === "allow" || outcome === "allow_a") return t.outcomeAllowA;
  if (outcome === "deny") return t.outcomeDeny;
  return t.outcomeEscalate;
}

function statusLabel(status: string, t: FeedCopy, held = false, mayAct?: boolean, phase?: string) {
  if (held) return t.statusHeld;
  if (phase === "in_court") return t.statusInCourt;
  if (status === "open") return t.statusOpen;
  if (status === "bargaining") return t.statusBargaining;
  if (status === "withdrawn") return t.statusWithdrawn;
  if (status === "awaiting_ack") return t.statusAck;
  if (status === "permitted") return mayAct ? t.statusPermitted : t.statusDenied;
  if (status === "executed") return t.statusExecuted;
  if (status === "escalated") return t.statusEscalated;
  return status;
}

function showOfflineCourtNote(item: InboxItem): boolean {
  const verdict = item.verdict;
  if (!verdict) return false;
  if (verdict.outcome === "allow" || verdict.outcome === "allow_a" || verdict.outcome === "deny") return false;
  const key = notifyReasonKey(verdict.reasoning ?? "", verdict.judge ?? "offline");
  if (key === "hookFailed" || key === "bargainTimeout") return false;
  if (key === "noFee" || key === "submitFail" || key === "txError") return false;
  return true;
}

function reportAckLate(item: InboxItem) {
  if (!item.ack_until) return false;
  return Date.parse(item.ack_until) <= Date.now();
}

function decisionLine(item: InboxItem, t: FeedCopy, notify: Messages["notify"]) {
  const verdict = item.verdict;
  if (!verdict) {
    if (item.status === "executed" || item.status === "permitted") return t.silence;
    if (item.status === "withdrawn") return t.withdrawn;
    if (item.case) return t.inCourt;
    if (item.status === "bargaining") return t.bargaining;
    if (item.status === "open") {
      return t.waiting;
    }
    return null;
  }
  const human = humanDecisionLine(item, t);
  if (human) return human;
  if (verdict.outcome === "allow" || verdict.outcome === "allow_a") return t.allowA;
  if (verdict.outcome === "deny") return t.deny;
  const key = notifyReasonKey(verdict.reasoning ?? "", verdict.judge ?? "offline");
  if (key === "hookFailed") return notify.hookFailed;
  if (key === "bargainTimeout") return notify.bargainTimeout;
  if (key === "noFee") return notify.noFee;
  if (key === "submitFail") return notify.submitFail;
  if (key === "txError") return notify.txError;
  return t.escalate;
}

function humanDecisionLine(item: InboxItem, t: FeedCopy): string | null {
  const verdict = item.verdict;
  if (!verdict?.appeal_of) return null;
  if (verdict.outcome !== "allow" && verdict.outcome !== "allow_a" && verdict.outcome !== "deny") return null;
  const done = verdict.outcome === "deny" ? t.humanDenied : t.humanAllowed;
  const priorReason = typeof verdict.prior_reasoning === "string" ? verdict.prior_reasoning : "";
  const priorJudge = typeof verdict.prior_judge === "string" ? verdict.prior_judge : "offline";
  if (!priorReason && !verdict.prior_judge) return done;
  const key = notifyReasonKey(priorReason, priorJudge);
  const why =
    key === "hookFailed"
      ? t.humanWhyHook
      : key === "bargainTimeout"
        ? t.humanWhyBargain
        : key === "noFee"
          ? t.humanWhyNoFee
          : key === "submitFail"
            ? t.humanWhySubmit
            : key === "txError"
              ? t.humanWhyTx
              : t.humanWhyCourt;
  return `${why} ${done}`;
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
