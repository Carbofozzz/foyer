"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";

export function SpawnButton({ locale, t }: { locale: Locale; t: Messages["spawn"] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onClick() {
    setPending(true);
    setError(false);
    const response = await fetch("/api/spawn", { method: "POST" });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: { cabinetToken: string } };
    window.location.assign(`/${locale}/cabinet/${payload.data.cabinetToken}`);
  }

  return (
    <section className="card stack">
      <h2 className="section-title">{t.title}</h2>
      <p className="hint">{t.lead}</p>
      <div className="row">
        <button type="button" className="ghost" disabled={pending} onClick={onClick}>
          {pending ? t.running : t.run}
        </button>
        <a className="ghost" href={`/${locale}/replay`}>
          {t.watch}
        </a>
      </div>
      {error ? <p className="error">{t.error}</p> : null}
    </section>
  );
}
