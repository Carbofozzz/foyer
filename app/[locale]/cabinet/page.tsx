import { notFound, redirect } from "next/navigation";
import { requireCabinet } from "@/lib/protocol/auth";
import { ensureHouseForOwner } from "@/lib/protocol/houses";
import { incomingRequest } from "@/lib/protocol/incoming";
import { readSession } from "@/lib/protocol/session";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { CabinetScreen } from "@/app/components/cabinet-screen";

export const maxDuration = 120;

export default async function CabinetMePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ enroll?: string }>;
}) {
  const { locale } = await params;
  const { enroll } = await searchParams;
  if (!isLocale(locale)) notFound();
  const request = await incomingRequest();
  let principal = await requireCabinet("me", request);
  if (!principal) {
    const session = readSession(request);
    if (!session) redirect(`/${locale}`);
    principal = await ensureHouseForOwner(session.address);
  }
  return (
    <CabinetScreen
      locale={locale}
      token="me"
      principal={principal}
      enroll={enroll}
      t={loadMessages(locale)}
    />
  );
}
