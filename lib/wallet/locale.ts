import type { Locale as RainbowLocale } from "@rainbow-me/rainbowkit";
import type { Locale } from "@/lib/i18n/config";

const MAP: Record<Locale, RainbowLocale> = {
  en: "en-US",
  es: "es-419",
  de: "de-DE",
  ru: "ru-RU",
  tr: "tr-TR",
};

export function rainbowLocale(locale: Locale): RainbowLocale {
  return MAP[locale];
}
