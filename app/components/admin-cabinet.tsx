import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import type { AdminOverview } from "@/lib/protocol/admin";
import { AdminDesk } from "@/app/components/admin-desk";
import { AccountBar } from "@/app/components/account-bar";

export function AdminCabinet({
  locale,
  t,
  overview,
  email,
}: {
  locale: Locale;
  t: Messages;
  overview: AdminOverview;
  email: string;
}) {
  const a = t.admin;
  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <div>
          <h1>{a.kicker}</h1>
          <p className="hint">{a.lead}</p>
        </div>
        <AccountBar
          locale={locale}
          enabled
          email={email}
          t={{
            signIn: t.home.signIn,
            signUp: t.home.signUp,
            signOut: t.home.signOut,
            cabinet: t.home.openCabinet,
            authOff: t.home.authOff,
          }}
        />
      </header>
      <section className="cabinet-panel">
        <div className="cabinet-scroll">
          <AdminDesk locale={locale} t={t} initial={overview} />
        </div>
      </section>
    </main>
  );
}
