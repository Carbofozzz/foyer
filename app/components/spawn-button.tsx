import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";

export function SpawnButton({ locale, t }: { locale: Locale; t: Messages["spawn"] }) {
  return (
    <section className="card stack">
      <p className="kicker">{t.kicker}</p>
      <h2 className="section-title">{t.title}</h2>
      <p className="hint">{t.lead}</p>
      <div className="row">
        <a className="ghost" href={`/${locale}/cabinet/demo`}>
          {t.run}
        </a>
      </div>
    </section>
  );
}
