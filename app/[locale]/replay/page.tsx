import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { ReplayView } from "@/app/components/replay-view";

export default async function ReplayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale);
  return <ReplayView locale={locale} replay={t.replay} cabinet={t.cabinet} />;
}
