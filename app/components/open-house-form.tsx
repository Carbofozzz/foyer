"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";

export function OpenHouseForm({ locale, t }: { locale: Locale; t: Messages["home"] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/houses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        type: form.get("type"),
      }),
    });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    const payload = (await response.json()) as {
      data: { cabinetToken: string; enrollmentToken: string };
    };
    const next = new URL(`/${locale}/cabinet/${payload.data.cabinetToken}`, window.location.origin);
    next.searchParams.set("enroll", payload.data.enrollmentToken);
    document.cookie = `foyer_locale=${locale}; path=/; max-age=31536000`;
    window.location.assign(`${next.pathname}${next.search}`);
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <label>
        {t.nameLabel}
        <input name="name" required placeholder={t.namePlaceholder} autoComplete="off" />
      </label>
      <label>
        {t.typeLabel}
        <select name="type" defaultValue="personal">
          <option value="personal">{t.typePersonal}</option>
          <option value="org">{t.typeOrg}</option>
        </select>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? t.submitting : t.submit}
      </button>
      {error ? <p className="error">{t.error}</p> : null}
    </form>
  );
}
