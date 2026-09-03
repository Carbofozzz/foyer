import type { Locale } from "./config";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import ru from "@/messages/ru.json";
import tr from "@/messages/tr.json";

const catalogs = { en, es, de, tr, ru } as const;

export type Messages = typeof en;

export function loadMessages(locale: Locale): Messages {
  return catalogs[locale];
}
