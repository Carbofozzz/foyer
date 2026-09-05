import { notFound } from "next/navigation";
import { requireCabinet } from "@/lib/protocol/auth";
import { incomingRequest } from "@/lib/protocol/incoming";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { CabinetScreen } from "@/app/components/cabinet-screen";

export const maxDuration = 120;

export default async function CabinetTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ enroll?: string }>;
}) {
  const { locale, token } = await params;
  const { enroll } = await searchParams;
  if (!isLocale(locale)) notFound();
  const principal = await requireCabinet(token, await incomingRequest());
  if (!principal) notFound();
  return (
    <CabinetScreen
      locale={locale}
      token={token}
      principal={principal}
      memberRole="owner"
      houses={[]}
      enroll={enroll}
      t={loadMessages(locale)}
    />
  );
}
