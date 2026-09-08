"use client";

import { useState } from "react";
import type { Messages } from "@/lib/i18n/load";
import type { NotifyReasonKey } from "@/lib/notify/reasons";

export function DecideCard({
  token,
  view,
  t,
  cabinetHref,
  errorLabel,
}: {
  token: string;
  view: {
    who: string;
    summary: string;
    amount: number | null;
    currency: string | null;
    reason: NotifyReasonKey;
  };
  t: Messages["notify"];
  cabinetHref: string;
  errorLabel: string;
}) {
  const [outcome, setOutcome] = useState<"allow" | "deny" | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!outcome) return;
    setPending(true);
    setError(false);
    const response = await fetch("/api/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, outcome }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <p>{t.decided}</p>
        <p>
          <a href={cabinetHref}>{t.cabinetLink}</a>
        </p>
      </>
    );
  }

  const money =
    view.amount == null ? "" : view.currency ? `${view.amount} ${view.currency}` : String(view.amount);

  return (
    <form className="stack" onSubmit={onSubmit}>
      <p className="hint">{t[view.reason]}</p>
      <p>
        {t.who}: {view.who}
      </p>
      <p>
        {t.what}: {view.summary}
      </p>
      {money ? (
        <p>
          {t.amount}: {money}
        </p>
      ) : null}
      <p>{t.ask}</p>
      <label>
        {t.outcome}
        <select value={outcome} onChange={(event) => setOutcome(event.target.value as "allow" | "deny" | "")}>
          <option value="">{t.pick}</option>
          <option value="allow">{t.allow}</option>
          <option value="deny">{t.deny}</option>
        </select>
      </label>
      <button type="submit" className="primary" disabled={pending || !outcome} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </button>
      {error ? <p className="error">{errorLabel}</p> : null}
    </form>
  );
}
