import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { AccountBar } from "@/app/components/account-bar";

export function HomeGate({
  locale,
  t,
  enabled,
  email,
  admin,
}: {
  locale: Locale;
  t: Messages["home"];
  enabled: boolean;
  email: string | null;
  admin: boolean;
}) {
  return (
    <div className="home-gate">
      <AccountBar
        locale={locale}
        enabled={enabled}
        email={email}
        admin={admin}
        t={{
          signIn: t.signIn,
          signUp: t.signUp,
          signOut: t.signOut,
          cabinet: t.openCabinet,
          admin: t.openAdmin,
          authOff: t.authOff,
        }}
      />
    </div>
  );
}
