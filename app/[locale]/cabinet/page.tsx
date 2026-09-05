import { notFound, redirect } from "next/navigation";
import { openCabinet } from "@/lib/protocol/auth";
import { ensureHouseForOwner } from "@/lib/protocol/houses";
import { incomingRequest } from "@/lib/protocol/incoming";
import { listHousesFor } from "@/lib/protocol/members";
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
  searchParams: Promise<{ enroll?: string; house?: string }>;
}) {
  const { locale } = await params;
  const { enroll, house } = await searchParams;
  if (!isLocale(locale)) notFound();
  const request = await incomingRequest();
  const session = readSession(request);
  if (!session) redirect(`/${locale}`);
  await ensureHouseForOwner(session.address);
  const opened = await openCabinet("me", request, house);
  if (!opened) {
    if (house) notFound();
    redirect(`/${locale}`);
  }
  return (
    <CabinetScreen
      locale={locale}
      token="me"
      principal={opened.principal}
      memberRole={opened.role}
      houses={await listHousesFor(session.address)}
      viewerAddress={session.address}
      enroll={enroll}
      t={loadMessages(locale)}
    />
  );
}
