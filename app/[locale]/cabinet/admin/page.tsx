import { notFound } from "next/navigation";
import { configuredAdminAddress, isAdminAddress, loadAdminOverview } from "@/lib/protocol/admin";
import { incomingRequest } from "@/lib/protocol/incoming";
import { readSession } from "@/lib/protocol/session";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { AdminCabinet } from "@/app/components/admin-cabinet";

export const dynamic = "force-dynamic";

export default async function AdminCabinetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!configuredAdminAddress()) notFound();
  const session = readSession(await incomingRequest());
  const t = loadMessages(locale);
  if (!session) {
    return <AdminCabinet locale={locale} t={t} />;
  }
  if (!isAdminAddress(session.address)) notFound();
  return <AdminCabinet locale={locale} t={t} overview={await loadAdminOverview()} address={session.address} />;
}
