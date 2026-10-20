import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export default async function GuidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const guide = loadMessages(locale).guide;

  return (
    <main className="stack">
      <p className="kicker">{guide.kicker}</p>
      <h1>{guide.title}</h1>
      <p className="lead">{guide.lead}</p>
      <section className="card stack" id="agent">
        <h2 className="section-title">{guide.agentTitle}</h2>
        <p>{guide.agentLead}</p>
        <ol className="guide-steps">
          {guide.agent.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="card stack" id="broker">
        <h2 className="section-title">{guide.brokerTitle}</h2>
        <p>{guide.brokerLead}</p>
        {guide.forms.map((form) => (
          <article key={form.title} className="stack">
            <h3 className="feed-label">
              {form.title} · {form.ready}
            </h3>
            <p>{form.body}</p>
          </article>
        ))}
      </section>
      <section className="card stack" id="git">
        <h2 className="section-title">{guide.gitTitle}</h2>
        <ol className="guide-steps">
          {guide.git.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="card stack" id="pay">
        <h2 className="section-title">{guide.payTitle}</h2>
        <ol className="guide-steps">
          {guide.pay.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <p>
        <Link href={`/${locale}/cabinet`}>{guide.back}</Link>
      </p>
    </main>
  );
}
