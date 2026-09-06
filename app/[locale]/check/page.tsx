import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export default async function CheckPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);

  return (
    <main>
      <p className="kicker">{t.check.kicker}</p>
      <h1>{t.check.title}</h1>
      <p className="lead">{t.check.lead}</p>
      <ol className="check-list">
        {t.check.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p>
        <a href={`/${locale}`}>{t.check.home}</a>
        {" · "}
        <a href={`/${locale}/cabinet/demo`}>{t.spawn.run}</a>
      </p>
    </main>
  );
}
