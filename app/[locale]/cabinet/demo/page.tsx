import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { DemoCabinet } from "@/app/components/demo-cabinet";

export default async function DemoCabinetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <DemoCabinet locale={locale} tab={tab} t={loadMessages(locale)} />;
}
