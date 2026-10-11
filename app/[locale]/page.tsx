import { notFound } from "next/navigation";
import { HomeGate } from "@/app/components/home-gate";
import { ProductOutline } from "@/app/components/product-outline";
import { WaitlistForm } from "@/app/components/waitlist-form";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { clerkConfigured, sessionUser } from "@/lib/protocol/session";
import { isPlatformAdmin } from "@/lib/protocol/users";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  const user = await sessionUser();

  return (
    <main className="home">
      <p className="kicker">{t.home.kicker}</p>
      <h1>{t.home.title}</h1>
      <p className="lead">{t.home.lead}</p>
      <HomeGate
        locale={locale}
        t={t.home}
        enabled={clerkConfigured()}
        email={user?.email ?? null}
        admin={isPlatformAdmin(user)}
      />
      <ProductOutline outline={t.outline} />
      <section className="card stack">
        <p className="kicker">{t.spawn.kicker}</p>
        <h2 className="section-title">{t.spawn.title}</h2>
        <p className="hint">{t.spawn.lead}</p>
        <div className="row">
          <a className="ghost" href={`/${locale}/cabinet/demo`}>
            {t.spawn.run}
          </a>
        </div>
      </section>
      <WaitlistForm locale={locale} t={t.waitlist} />
    </main>
  );
}
