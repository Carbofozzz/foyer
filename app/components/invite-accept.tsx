"use client";

import { SignInButton } from "@clerk/nextjs";

export function InviteAccept({
  locale,
  token,
  email,
  houseName,
  signedIn,
  wrongEmail,
  needVerify,
  t,
}: {
  locale: string;
  token: string;
  email: string;
  houseName: string;
  signedIn: boolean;
  wrongEmail: boolean;
  needVerify: boolean;
  t: {
    inviteTitle: string;
    inviteLead: string;
    inviteSignIn: string;
    inviteWrongEmail: string;
    inviteVerify: string;
    inviteOpen: string;
  };
}) {
  const returnUrl = `/${locale}/invite/${token}`;
  return (
    <div className="stack">
      <p>{t.inviteLead.replace("{house}", houseName).replace("{email}", email)}</p>
      <p className="mono muted">{email}</p>
      {wrongEmail ? <p className="error">{t.inviteWrongEmail}</p> : null}
      {needVerify ? <p className="error">{t.inviteVerify}</p> : null}
      {!signedIn ? (
        <SignInButton mode="modal" forceRedirectUrl={returnUrl} signUpForceRedirectUrl={returnUrl}>
          <button type="button" className="primary">
            {t.inviteSignIn}
          </button>
        </SignInButton>
      ) : null}
      {signedIn && !wrongEmail && !needVerify ? (
        <a className="primary" href={`/${locale}/cabinet`}>
          {t.inviteOpen}
        </a>
      ) : null}
    </div>
  );
}
