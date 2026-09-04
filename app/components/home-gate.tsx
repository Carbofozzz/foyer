"use client";

import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { WalletButton } from "@/app/components/wallet-button";

export function HomeGate({
  locale,
  t,
  initialAddress,
}: {
  locale: Locale;
  t: Messages["home"];
  initialAddress: string | null;
}) {
  return (
    <div className="card home-gate">
      <WalletButton
        locale={locale}
        signOutLabel={t.signOut}
        connectLabel={t.signIn}
        signingInLabel={t.signingIn}
        cabinetLabel={t.openCabinet}
        initialAddress={initialAddress}
      />
    </div>
  );
}
