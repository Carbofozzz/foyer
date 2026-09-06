import { cookies, headers } from "next/headers";
import { isLocale, negotiateLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";

export async function NotFoundView() {
  const headerList = await headers();
  const fromPath = headerList.get("x-foyer-locale") ?? undefined;
  const cookie = (await cookies()).get("foyer_locale")?.value;
  const locale = isLocale(fromPath)
    ? fromPath
    : isLocale(cookie)
      ? cookie
      : negotiateLocale(headerList.get("accept-language"));
  const t = loadMessages(locale);
  return (
    <main>
      <p className="kicker">{t.notFound.kicker}</p>
      <h1>{t.notFound.title}</h1>
      <p className="lead">{t.notFound.lead}</p>
    </main>
  );
}
