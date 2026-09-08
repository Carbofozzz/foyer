import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { loadDecideView } from "@/lib/notify/outbox";
import { DecideCard } from "@/app/components/decide-card";
import { ProtocolError } from "@/lib/protocol/errors";

export default async function DecidePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  let view: Awaited<ReturnType<typeof loadDecideView>> | null = null;
  let dead = false;
  try {
    view = await loadDecideView(token);
  } catch (error) {
    if (error instanceof ProtocolError && (error.status === 404 || error.status === 410)) dead = true;
    else throw error;
  }

  return (
    <main className="stack connect-doc">
      <p className="kicker">{t.notify.decideKicker}</p>
      <h1>{t.notify.decideTitle}</h1>
      <section className="card stack">
        {dead || !view ? (
          <>
            <p>{t.notify.dead}</p>
            <p>
              <a href={`/${locale}/cabinet`}>{t.notify.cabinetLink}</a>
            </p>
          </>
        ) : (
          <DecideCard
            token={token}
            view={view}
            t={t.notify}
            cabinetHref={`/${locale}/cabinet`}
            errorLabel={t.cabinet.error}
          />
        )}
      </section>
    </main>
  );
}
