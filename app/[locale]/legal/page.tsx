import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  const d = t.legal;

  return (
    <main className="stack connect-doc">
      <p className="kicker">{d.kicker}</p>
      <h1>{d.title}</h1>
      <p className="lead">{d.lead}</p>
      <section className="card stack">
        <p>{d.body}</p>
        <p className="hint">{d.contact}</p>
      </section>
    </main>
  );
}
