import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { requireCabinet } from "@/lib/protocol/auth";
import { inboxForPrincipal } from "@/lib/protocol/actions";
import { sweep } from "@/lib/protocol/sweep";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { CabinetWizard } from "@/app/components/cabinet-wizard";

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
  const hasGuardian = houseAgents.some((agent) => agent.isGuardian);
  const step = !principal.wizardRulesDone
    ? "rules"
    : !principal.wizardLockDone
      ? "lock"
      : !hasGuardian
        ? "guardian"
        : inbox.items.length === 0
          ? "first"
          : null;

  return (
    <main>
      <p className="kicker">{t.cabinet.kicker}</p>
      <h1>{principal.name || t.cabinet.untitled}</h1>
      <p className="hint">{t.cabinet.cabinetHint}</p>

      {step ? (
        <CabinetWizard
          token={token}
          step={step}
          wizard={t.wizard}
          charter={t.charter}
          cabinetError={t.cabinet.error}
          constitution={principal.constitution}
        />
      ) : (
        <>
          <section className="card">
            <h2 className="section-title">{t.cabinet.constitution}</h2>
            <pre>{principal.constitution}</pre>
          </section>

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
                    {agent.name} · {agent.role}
                    {agent.isGuardian ? ` · ${t.cabinet.guardian}` : ""}
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
                  <li key={item.id} className="feed-item">
                    <p>
                      <strong>{item.kind}</strong> · {statusLabel(item.status, t.cabinet)}
                    </p>
                    <p className="muted">{summaryOf(item.payload)}</p>
                    {item.verdict ? <p>{item.verdict.outcome}</p> : null}
                    {item.verdict ? <p className="hint">{item.verdict.reasoning}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function statusLabel(
  status: string,
  t: { statusOpen: string; statusAck: string; statusExecuted: string; statusEscalated: string },
) {
  if (status === "open") return t.statusOpen;
  if (status === "awaiting_ack") return t.statusAck;
  if (status === "executed") return t.statusExecuted;
  if (status === "escalated") return t.statusEscalated;
  return status;
}

function summaryOf(payload: unknown) {
  if (payload && typeof payload === "object" && "summary" in payload && typeof payload.summary === "string") {
    return payload.summary;
  }
  return "";
}
