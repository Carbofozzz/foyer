"use client";

import { SignInButton, SignOutButton, SignUpButton } from "@clerk/nextjs";

export type AccountLabels = {
  signIn: string;
  signUp: string;
  signOut: string;
  cabinet?: string;
  admin?: string;
  authOff: string;
};

/** Session state comes from the server so the bar does not flicker on paint. */
export function AccountBar({
  locale,
  enabled,
  email,
  admin = false,
  t,
}: {
  locale: string;
  enabled: boolean;
  email: string | null;
  admin?: boolean;
  t: AccountLabels;
}) {
  if (!enabled) return <p className="hint">{t.authOff}</p>;
  if (!email) {
    return (
      <div className="wallet-toolbar">
        <SignInButton mode="modal" forceRedirectUrl={`/${locale}/cabinet`}>
          <button type="button" className="primary">
            {t.signIn}
          </button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl={`/${locale}/cabinet`}>
          <button type="button" className="ghost">
            {t.signUp}
          </button>
        </SignUpButton>
      </div>
    );
  }
  return (
    <div className="wallet-toolbar">
      {t.cabinet ? (
        <a className="primary" href={`/${locale}/cabinet`}>
          {t.cabinet}
        </a>
      ) : null}
      {t.admin && admin ? (
        <a className="ghost" href={`/${locale}/cabinet/admin`}>
          {t.admin}
        </a>
      ) : null}
      <span className="mono muted">{email}</span>
      <SignOutButton redirectUrl={`/${locale}`}>
        <button type="button" className="ghost">
          {t.signOut}
        </button>
      </SignOutButton>
    </div>
  );
}
