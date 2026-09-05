import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { readHealth } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  const health = await readHealth();
  const headline = !health.ok
    ? t.status.down
    : !health.tick.at
      ? t.status.never
      : health.tick.stale
        ? t.status.stale
        : t.status.ok;

  return (
    <main className="stack">
      <p className="kicker">{t.status.kicker}</p>
      <h1>{t.status.title}</h1>
      <p className="lead">{headline}</p>
      <section className="card stack">
        <p>
          <strong>{t.status.env}</strong> {health.env}
        </p>
        <p>
          <strong>{t.status.db}</strong> {health.db}
        </p>
        <p>
          <strong>{t.status.cron}</strong>{" "}
          {health.tick.runs_here ? t.status.cronHere : t.status.cronElsewhere}
        </p>
        <p>
          <strong>{t.status.tick}</strong> {health.tick.at ?? t.status.never}
        </p>
        <p className="hint">
          {t.status.writes
            .replace("{n}", String(health.writes_last_hour.writes))
            .replace("{limited}", String(health.writes_last_hour.limited))}
        </p>
      </section>
      <p>
        <a href={`/${locale}`}>{t.status.home}</a>
        {" · "}
        <a href="/api/health">{t.status.health}</a>
      </p>
    </main>
  );
}
