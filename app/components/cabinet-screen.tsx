import { eq } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { inboxForPrincipal } from "@/lib/protocol/actions";
import { sweep } from "@/lib/protocol/sweep";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import type { Messages } from "@/lib/i18n/load";
import { CabinetWizard } from "@/app/components/cabinet-wizard";
import { ConnectCard } from "@/app/components/connect-card";
import { TechCard } from "@/app/components/tech-card";
import { TreasuryCard } from "@/app/components/treasury-card";
import { AppealForm } from "@/app/components/appeal-form";
import { HouseSwitch } from "@/app/components/house-switch";
import { MembersCard } from "@/app/components/members-card";
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
  t,
}: {
  locale: string;
  token: string;
  principal: HousePrincipal;
  memberRole?: MemberRole;
  houses?: HouseListing[];
  viewerAddress?: string | null;
  enroll?: string;
  t: Messages;
}) {
  await sweep(principal.id, new Date());
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principal.id));
  const inbox = await inboxForPrincipal(principal.id);
  const names = Object.fromEntries(houseAgents.map((agent) => [agent.id, agent.name]));
  const liveIds = liveAgentIds(inbox.items);
  const hasGuardian = houseAgents.some((agent) => agent.isGuardian);
  const step = !principal.wizardRulesDone
    ? "rules"
    : !principal.wizardLockDone
      ? "lock"
      : !principal.wizardConnectDone && inbox.items.length === 0
        ? "connect"
        : !hasGuardian
          ? "guardian"
          : inbox.items.length === 0
            ? "first"
            : null;
  const now = Date.now();
  const signedIn = token === "me";
  const houseId = signedIn ? principal.id : undefined;
  const manage = canManage(memberRole);
  const operate = canOperate(memberRole);

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

      <TreasuryCard
        token={token}
        houseId={houseId}
        canDeposit={operate}
        canManage={manage}
        t={t.cabinet}
        errorLabel={t.cabinet.error}
      />

      <section className="cabinet-panel">
        {step && !manage ? (
          <p className="hint">{t.cabinet.setupWait}</p>
        ) : step ? (
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
        ) : (
          <>
            <div className="cabinet-panel-head">
              <h2 className="section-title">{t.cabinet.inbox}</h2>
              {houseAgents.length > 0 ? (
                <ul className="agent-chips">
                  {houseAgents.map((agent) => (
                    <li
                      key={agent.id}
                      className={liveIds.has(agent.id) || agent.isGuardian ? "agent-live" : "agent-wait"}
                    >
                      {agent.name}
                      {agent.isGuardian
                        ? ` · ${t.cabinet.guardian}`
                        : liveIds.has(agent.id)
                          ? ` · ${t.cabinet.agentLive}`
                          : ` · ${t.cabinet.agentWait}`}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="cabinet-scroll">
              {inbox.items.length === 0 ? (
                <p className="empty">{t.cabinet.emptyInbox}</p>
              ) : (
                <ul className="feed">
                  {inbox.items.map((item) => (
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
                </ul>
              )}
            </div>
            <div className="cabinet-meta">
              {enroll ? (
                <details>
                  <summary>{t.cabinet.enrollment}</summary>
                  <p className="mono">{enroll}</p>
                </details>
              ) : null}
              <details>
                <summary>{t.cabinet.constitution}</summary>
                <p className="charter">{principal.constitution}</p>
              </details>
              {operate ? (
                <details>
                  <summary>{t.connect.title}</summary>
                  <ConnectCard
                    token={token}
                    houseId={houseId}
                    houseType={principal.type === "org" ? "org" : "personal"}
                    t={t.connect}
                    errorLabel={t.cabinet.error}
                    compact
                  />
                </details>
              ) : null}
              {operate ? (
                <details>
                  <summary>{t.tech.title}</summary>
                  <TechCard token={token} houseId={houseId} t={t.tech} errorLabel={t.cabinet.error} />
                </details>
              ) : null}
              {signedIn && principal.type === "org" && !principal.isSpawn ? (
                <MembersCard
                  token={token}
                  houseId={principal.id}
                  selfAddress={viewerAddress}
                  canInvite={manage}
                  t={t.cabinet}
                  errorLabel={t.cabinet.error}
                />
              ) : null}
            </div>
          </>
        )}
      </section>
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
  const carried = formatAction(executedPayload(item.executions[0]?.result));

  return (
    <li className="feed-item">
      <p className="muted">{statusLabel(item.status, t, Boolean(item.held_until && new Date(item.held_until).getTime() > now))}</p>
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
          <p className="feed-label">{t.decision}</p>
          <p>{decision}</p>
          {item.held_until && new Date(item.held_until).getTime() > now ? (
            <p className="hint">{t.holdAppeal}</p>
          ) : null}
          {item.verdict?.outcome !== "escalate" && carried && carried !== decided ? (
            <p className="hint">{t.done.replace("{summary}", carried)}</p>
          ) : null}
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

function statusLabel(status: string, t: FeedCopy, held = false) {
  if (held) return t.statusHeld;
  if (status === "open") return t.statusOpen;
  if (status === "awaiting_ack") return t.statusAck;
  if (status === "executed") return t.statusExecuted;
  if (status === "escalated") return t.statusEscalated;
  return status;
}

function decisionLine(item: InboxItem, t: FeedCopy, decided: string, now: number) {
  const verdict = item.verdict;
  if (!verdict) {
    if (item.status === "executed") return t.silence;
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

function executedPayload(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  return row.charged ?? row.would_book ?? row.would_charge ?? row.would_message ?? row.would_cancel ?? null;
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
