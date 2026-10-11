import { notFound, redirect } from "next/navigation";
import { InviteAccept } from "@/app/components/invite-accept";
import { isLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { acceptInviteToken, peekInviteToken } from "@/lib/protocol/members";
import { sessionUser } from "@/lib/protocol/session";

export default async function InvitePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const t = loadMessages(locale).notify;
  const peek = await peekInviteToken(token);
  if (!peek) {
    return (
      <main className="stack connect-doc">
        <p className="kicker">{t.inviteKicker}</p>
        <h1>{t.inviteTitle}</h1>
        <section className="card stack">
          <p>{t.dead}</p>
          <a className="ghost" href={`/${locale}/cabinet`}>
            {t.cabinetLink}
          </a>
        </section>
      </main>
    );
  }
  if (peek.accepted || peek.expired) {
    return (
      <main className="stack connect-doc">
        <p className="kicker">{t.inviteKicker}</p>
        <h1>{t.inviteTitle}</h1>
        <section className="card stack">
          <p>{peek.accepted ? t.inviteAlready : t.dead}</p>
          <a className="primary" href={`/${locale}/cabinet${peek.accepted ? `?house=${encodeURIComponent(peek.principalId)}` : ""}`}>
            {t.cabinetLink}
          </a>
        </section>
      </main>
    );
  }

  const user = await sessionUser();
  if (user?.emailVerified && user.email === peek.email) {
    const { principalId } = await acceptInviteToken(token, user);
    redirect(`/${locale}/cabinet?house=${encodeURIComponent(principalId)}`);
  }

  const wrongEmail = Boolean(user && user.email !== peek.email);
  const needVerify = Boolean(user && user.email === peek.email && !user.emailVerified);

  return (
    <main className="stack connect-doc">
      <p className="kicker">{t.inviteKicker}</p>
      <h1>{t.inviteTitle}</h1>
      <section className="card stack">
        <InviteAccept
          locale={locale}
          token={token}
          email={peek.email}
          houseName={peek.houseName}
          signedIn={Boolean(user)}
          wrongEmail={wrongEmail}
          needVerify={needVerify}
          t={t}
        />
      </section>
    </main>
  );
}
