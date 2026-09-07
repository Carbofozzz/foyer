"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";

export function AppealForm({
  token,
  houseId,
  caseId,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  caseId: string;
  t: Messages["appeal"];
  errorLabel: string;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"allow_a" | "allow_b" | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!outcome) return;
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cases/${caseId}/appeal`, {
      method: "POST",
      headers: cabinetHeaders(houseId, {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      }),
      body: JSON.stringify({ outcome }),
    });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    window.location.reload();
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <p className="feed-label">{t.label}</p>
      <label>
        {t.outcome}
        <select value={outcome} onChange={(event) => setOutcome(event.target.value as "allow_a" | "allow_b" | "")}>
          <option value="">{t.keep}</option>
          <option value="allow_a">{t.allowA}</option>
          <option value="allow_b">{t.allowB}</option>
        </select>
      </label>
      <button type="submit" disabled={pending || !outcome} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </button>
      {error ? <p className="error">{errorLabel}</p> : null}
    </form>
  );
}
