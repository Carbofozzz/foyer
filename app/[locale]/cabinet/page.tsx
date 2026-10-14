import { notFound, redirect } from "next/navigation";
import { openCabinet } from "@/lib/protocol/auth";
import { ProtocolError } from "@/lib/protocol/errors";
import { incomingRequest } from "@/lib/protocol/incoming";
import { listHousesFor } from "@/lib/protocol/members";
import { sessionUser } from "@/lib/protocol/session";
import { isPlatformAdmin } from "@/lib/protocol/users";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { CabinetScreen } from "@/app/components/cabinet-screen";

export const maxDuration = 120;

export default async function CabinetMePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ enroll?: string; house?: string; tab?: string }>;
}) {
  const { locale } = await params;
  const { enroll, house, tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  const request = await incomingRequest();
  const user = await sessionUser();
  if (!user) redirect(`/${locale}`);
  let opened;
  try {
    opened = await openCabinet("me", request, house);
  } catch (error) {
    // Frozen org — send the owner back to the personal cabinet (Plan / renew).
    if (error instanceof ProtocolError && house) {
      redirect(`/${locale}/cabinet?tab=plan`);
    }
    throw error;
  }
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
      memberGrants={opened.grants}
      houses={await listHousesFor(user.id)}
      viewer={{ id: user.id, email: user.email, admin: isPlatformAdmin(user) }}
      enroll={enroll}
      tab={tab}
      t={loadMessages(locale)}
    />
  );
}
