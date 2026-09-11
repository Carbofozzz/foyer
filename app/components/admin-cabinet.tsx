import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import type { AdminOverview } from "@/lib/protocol/admin";
import { AdminDesk } from "@/app/components/admin-desk";
import { WalletButton } from "@/app/components/wallet-button";

export function AdminCabinet({
  locale,
  t,
  overview,
  address,
}: {
  locale: Locale;
  t: Messages;
  overview?: AdminOverview;
  address?: string;
}) {
  const a = t.admin;
  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <div>
          <h1>{a.kicker}</h1>
          <p className="hint">{a.lead}</p>
        </div>
        <WalletButton
          locale={locale}
          signOutLabel={t.home.signOut}
          connectLabel={a.signIn}
          signingInLabel={t.home.signingIn}
          cabinetLabel={t.home.openCabinet}
          adminLabel={t.home.openAdmin}
          initialAddress={address ?? null}
        />
      </header>
      <section className="cabinet-panel">
        <div className="cabinet-scroll stack admin-desk">
          {!overview ? <p className="hint">{a.needSignIn}</p> : <AdminDesk locale={locale} t={t} initial={overview} />}
        </div>
      </section>
    </main>
  );
}
