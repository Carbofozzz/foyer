import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { ConfirmEmailCard } from "@/app/components/confirm-email-card";

export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  return (
    <main className="stack connect-doc">
      <p className="kicker">{t.notify.confirmKicker}</p>
      <h1>{t.notify.confirmTitle}</h1>
      <section className="card stack">
        <ConfirmEmailCard token={token} t={t.notify} cabinetHref={`/${locale}/cabinet`} />
      </section>
    </main>
  );
}
