import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { HomeGate } from "@/app/components/home-gate";
import { SpawnButton } from "@/app/components/spawn-button";
import { ProductOutline } from "@/app/components/product-outline";
import { WaitlistForm } from "@/app/components/waitlist-form";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { parseSession } from "@/lib/protocol/session";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  const session = parseSession((await cookies()).get("foyer_session")?.value);

  return (
    <main className="home">
      <p className="kicker">{t.home.kicker}</p>
      <h1>{t.home.title}</h1>
      <p className="lead">{t.home.lead}</p>
      <HomeGate locale={locale} t={t.home} initialAddress={session?.address ?? null} />
      <p className="price-line">
        <strong>{t.home.priceKicker}</strong> {t.home.priceLead}
      </p>
      <ProductOutline outline={t.outline} protocol={t.protocol} />
      <SpawnButton locale={locale} t={t.spawn} />
      <WaitlistForm locale={locale} t={t.waitlist} />
      <p>
        <a href={`/${locale}/check`}>{t.check.open}</a>
        {" · "}
        <a href={`/${locale}/status`}>{t.status.open}</a>
      </p>
    </main>
  );
}
