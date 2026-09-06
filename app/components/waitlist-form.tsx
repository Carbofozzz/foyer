"use client";

import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";

export function WaitlistForm({ locale, t }: { locale: Locale; t: Messages["waitlist"] }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<"invalid" | "fail" | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setPending(true);
    setError(null);
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, locale }),
    });
    setPending(false);
    if (response.status === 400) {
      setError("invalid");
      return;
    }
    if (!response.ok) {
      setError("fail");
      return;
    }
    setDone(true);
  }

  return (
    <section className="card stack">
      <h2 className="section-title">{t.title}</h2>
      <p className="hint">{t.lead}</p>
      {done ? (
        <p>{t.thanks}</p>
      ) : (
        <form className="waitlist-form" onSubmit={onSubmit}>
          <label>
            {t.email}
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <button type="submit" className="primary" disabled={pending} aria-busy={pending}>
            {pending ? t.submitting : t.submit}
          </button>
        </form>
      )}
      {error === "invalid" ? <p className="error">{t.invalid}</p> : null}
      {error === "fail" ? <p className="error">{t.error}</p> : null}
    </section>
  );
}
