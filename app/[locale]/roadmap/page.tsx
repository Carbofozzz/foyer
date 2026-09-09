import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export default async function RoadmapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  const d = t.roadmap;

  return (
    <main className="stack connect-doc">
      <p className="kicker">{d.kicker}</p>
      <h1>{d.title}</h1>
      <p className="lead">{d.lead}</p>
      {d.items.map((item) => (
        <section className="card stack" key={item.title}>
          <h2 className="section-title">{item.title}</h2>
          <p>{item.body}</p>
        </section>
      ))}
      <p className="hint">{d.hint}</p>
    </main>
  );
}
