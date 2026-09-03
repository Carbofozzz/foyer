"use client";

import { usePathname } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() || `/${locale}`;
  const rest = pathname.split("/").slice(2).join("/");

  return (
    <nav className="locale-switch" aria-label={label}>
      {LOCALES.map((code) => {
        const href = rest ? `/${code}/${rest}` : `/${code}`;
        return (
          <a
            key={code}
            href={href}
            hrefLang={code}
            aria-current={code === locale || undefined}
            onClick={() => {
              document.cookie = `foyer_locale=${code}; path=/; max-age=31536000`;
            }}
          >
            {code}
          </a>
        );
      })}
    </nav>
  );
}
