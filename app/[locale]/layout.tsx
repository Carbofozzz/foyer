import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { serif } from "@/lib/i18n/font";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { WalletProviders } from "@/app/components/wallet-providers";

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

  return (
    <html lang={locale} className={serif.className}>
      <body>
        <WalletProviders locale={locale}>
          <div className="app-shell">
            <header className="topbar">
              <a className="brand" href={`/${locale}`}>
                <img src="/brand/foyer-mark.png" alt={t.brand.markAlt} width={36} height={36} />
                <span className="brand-name">{t.brand.name}</span>
              </a>
              <LanguageSwitcher locale={locale} label={t.nav.locale} />
            </header>
            {children}
          </div>
        </WalletProviders>
      </body>
    </html>
  );
}
