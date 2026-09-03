import { notFound } from "next/navigation";
import { OpenHouseForm } from "@/app/components/open-house-form";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);

  return (
    <main>
      <p className="kicker">{t.home.kicker}</p>
      <h1>{t.home.title}</h1>
      <p className="lead">{t.home.lead}</p>
      <OpenHouseForm locale={locale} t={t.home} />
      <section className="card">
        <h2 className="section-title">{t.protocol.title}</h2>
        <p className="hint">{t.protocol.lead}</p>
      </section>
    </main>
  );
}
