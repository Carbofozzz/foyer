import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { agents } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { requireCabinet } from "@/lib/protocol/auth";
import { judgeOffline } from "@/lib/judge/offline";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

const SAMPLE = {
  constitution:
    "Save money, except being late for work or losing a client. External promises outrank internal convenience.",
  proposed_action: {
    kind: "book" as const,
    summary: "Business class, €420",
    amount: 420,
    currency: "EUR",
  },
  objection: {
    justification: "Budget: save money; economy is €180.",
    counter_action: {
      kind: "book" as const,
      summary: "Economy, €180",
      amount: 180,
      currency: "EUR",
    },
  },
  evidence: [{ type: "text" as const, value: "Presentation at 9:00" }],
};

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

  const t = loadMessages(locale);
  const db = getDb();
  const houseAgents = await db.select().from(agents).where(eq(agents.principalId, principal.id));
  const sample = judgeOffline(SAMPLE);

  return (
    <main>
      <p className="kicker">{t.cabinet.kicker}</p>
      <h1>{principal.name || t.cabinet.untitled}</h1>
      <p className="hint">{t.cabinet.cabinetHint}</p>

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
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">{t.cabinet.inbox}</h2>
        <p className="empty">{t.cabinet.emptyInbox}</p>
      </section>

      <section className="card">
        <h2 className="section-title">{t.cabinet.court}</h2>
        <p className="hint">{t.cabinet.courtHint}</p>
        <pre>{JSON.stringify({ judge: "offline", ...sample }, null, 2)}</pre>
      </section>
    </main>
  );
}
