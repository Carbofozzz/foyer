import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { sans, serif } from "@/lib/i18n/font";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { ClerkProvider } from "@clerk/nextjs";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = loadMessages(locale);
  return {
    title: t.meta.title,
    description: t.meta.description,
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);

  const page = (
    <html lang={locale} className={`${serif.variable} ${sans.variable}`}>
      <body>
        <div className="app-shell">
          <header className="topbar">
            <a className="brand" href={`/${locale}`}>
              <img src="/brand/foyer-mark.png" alt={t.brand.markAlt} width={36} height={36} />
              <span className="brand-name">{t.brand.name}</span>
            </a>
            <LanguageSwitcher locale={locale} label={t.nav.locale} />
          </header>
          {children}
          <footer className="site-foot">
            <p>
              {t.footer.copy}
              {" · "}
              {t.footer.powered}{" "}
              <a href="https://genlayer.com" target="_blank" rel="noreferrer">
                GenLayer
              </a>
            </p>
            <nav className="site-foot-links" aria-label={t.footer.links}>
              <a href={`/${locale}/pricing`}>{t.pricing.open}</a>
              <a href={`/${locale}/roadmap`}>{t.roadmap.open}</a>
              <a href={`/${locale}/legal`}>{t.legal.open}</a>
              <a href={`/${locale}/privacy`}>{t.privacy.open}</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return page;
  return (
    <ClerkProvider
      signInFallbackRedirectUrl={`/${locale}/cabinet`}
      signUpFallbackRedirectUrl={`/${locale}/cabinet`}
      afterSignOutUrl={`/${locale}`}
    >
      {page}
    </ClerkProvider>
  );
}
