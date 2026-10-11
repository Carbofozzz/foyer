import { notFound } from "next/navigation";
import { loadAdminOverview } from "@/lib/protocol/admin";
import { sessionUser } from "@/lib/protocol/session";
import { isPlatformAdmin } from "@/lib/protocol/users";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { AdminCabinet } from "@/app/components/admin-cabinet";

export const dynamic = "force-dynamic";

export default async function AdminCabinetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await sessionUser();
  if (!isPlatformAdmin(user) || !user) notFound();
  return <AdminCabinet locale={locale} t={loadMessages(locale)} overview={await loadAdminOverview()} email={user.email} />;
}
