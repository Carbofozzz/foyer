import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { requireCabinet } from "@/lib/protocol/auth";
import { inboxForPrincipal } from "@/lib/protocol/actions";
import { sweep } from "@/lib/protocol/sweep";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages, type Messages } from "@/lib/i18n/load";
import { CabinetWizard } from "@/app/components/cabinet-wizard";
import { ConnectCard } from "@/app/components/connect-card";
import { AppealForm } from "@/app/components/appeal-form";

type FeedCopy = Messages["cabinet"];
type InboxItem = Awaited<ReturnType<typeof inboxForPrincipal>>["items"][number];

export default async function CabinetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ enroll?: string }>;
}) {
  const { locale, token } = await params;
  const { enroll } = await searchParams;
  if (!isLocale(locale)) notFound();
  const principal = await requireCabinet(token);
  if (!principal) notFound();

  await sweep(principal.id, new Date());
  const t = loadMessages(locale);
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principal.id));
  const inbox = await inboxForPrincipal(principal.id);
  const names = Object.fromEntries(houseAgents.map((agent) => [agent.id, agent.name]));
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

  return (
    <main>
      <p className="kicker">{t.cabinet.kicker}</p>
      <h1>{principal.name || t.cabinet.untitled}</h1>
      <p className="hint">{t.cabinet.cabinetHint}</p>
      {principal.isSpawn ? <p className="hint">{t.spawn.banner}</p> : null}

      {step ? (
        <CabinetWizard
          token={token}
          step={step}
          wizard={t.wizard}
          connect={t.connect}
          charter={t.charter}
          cabinetError={t.cabinet.error}
          constitution={principal.constitution}
        />
      ) : (
        <>
          <section className="card">
            <h2 className="section-title">{t.cabinet.constitution}</h2>
            <p className="charter">{principal.constitution}</p>
          </section>

          <ConnectCard token={token} t={t.connect} errorLabel={t.cabinet.error} />

          {enroll ? (
            <section className="card">
              <h2 className="section-title">{t.cabinet.enrollment}</h2>
              <p className="hint">{t.cabinet.enrollmentHint}</p>
              <p className="mono">{enroll}</p>
            </section>
          ) : null}

          <section className="card">
            <h2 className="section-title">{t.cabinet.agents}</h2>
            {houseAgents.length === 0 ? (
              <p className="empty">{t.cabinet.emptyAgents}</p>
            ) : (
              <ul>
                {houseAgents.map((agent) => (
                  <li key={agent.id}>
                    {agent.name}
                    {agent.isGuardian ? ` · ${t.cabinet.guardian}` : ""}
                    {` · ${t.cabinet.bond.replace("{n}", String(agent.bondBalance))}`}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="section-title">{t.cabinet.inbox}</h2>
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
                    errorLabel={t.cabinet.error}
                    now={now}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
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
  errorLabel,
  now,
}: {
  item: InboxItem;
  names: Record<string, string>;
  t: FeedCopy;
  appeal: Messages["appeal"];
  token: string;
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
  const decision = decisionLine(item, t, decided);
  const carried = formatAction(executedPayload(item.executions[0]?.result));

  return (
    <li className="feed-item">
      <p className="muted">{statusLabel(item.status, t)}</p>
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
              {item.verdict?.outcome !== "escalate" && carried && carried !== decided ? (
                <p className="hint">{t.done.replace("{summary}", carried)}</p>
              ) : null}
            </div>
          ) : null}
      {item.case && item.appeal_until && new Date(item.appeal_until).getTime() > now ? (
        <div className="feed-block">
          <AppealForm token={token} caseId={item.case.id} t={appeal} errorLabel={errorLabel} />
        </div>
      ) : null}
    </li>
  );
}

function kindLabel(kind: string, t: FeedCopy) {
  if (kind === "book") return t.kindBook;
  if (kind === "spend") return t.kindSpend;
  if (kind === "message") return t.kindMessage;
  if (kind === "cancel") return t.kindCancel;
  return kind;
}

function statusLabel(status: string, t: FeedCopy) {
  if (status === "open") return t.statusOpen;
  if (status === "awaiting_ack") return t.statusAck;
  if (status === "executed") return t.statusExecuted;
  if (status === "escalated") return t.statusEscalated;
  return status;
}

function decisionLine(item: InboxItem, t: FeedCopy, decided: string) {
  const verdict = item.verdict;
  if (!verdict) {
    if (item.status === "executed") return t.silence;
    if (item.status === "open") return t.waiting;
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
  return row.would_book ?? row.would_charge ?? row.would_message ?? row.would_cancel ?? null;
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
