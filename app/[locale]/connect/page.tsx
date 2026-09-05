import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export default async function ConnectDocPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  const d = t.connectDoc;

  return (
    <main className="stack connect-doc">
      <p className="kicker">{d.kicker}</p>
      <h1>{d.title}</h1>
      <p className="lead">{d.lead}</p>
      <section className="card stack">
        <p>{d.product}</p>
        <p>{d.off}</p>
        <p>{d.prompt}</p>
      </section>
      <section className="card stack">
        <h2 className="section-title">{t.connect.runtimeCursor}</h2>
        <p>{d.cursor}</p>
        <h2 className="section-title">{t.connect.runtimeClaude}</h2>
        <p>{d.claude}</p>
        <h2 className="section-title">{t.connect.runtimeChatgpt}</h2>
        <p>{d.chatgpt}</p>
        <h2 className="section-title">{t.connect.runtimeOpenclaw}</h2>
        <p>{d.openclaw}</p>
      </section>
      <section className="card stack">
        <p>{d.http}</p>
        <p className="hint">{d.spawn}</p>
      </section>
      <p>
        <a href={`/${locale}`}>{d.home}</a>
        {" · "}
        <a href={`/${locale}/cabinet`}>{t.home.openCabinet}</a>
      </p>
    </main>
  );
}
