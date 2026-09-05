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
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const body: Record<string, string> = { note };
    if (outcome) body.outcome = outcome;
    const response = await fetch(`/api/cases/${caseId}/appeal`, {
      method: "POST",
      headers: cabinetHeaders(houseId, {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      }),
      body: JSON.stringify(body),
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
        {t.note}
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <label>
        {t.outcome}
        <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="">{t.keep}</option>
          <option value="allow_a">{t.allowA}</option>
          <option value="allow_b">{t.allowB}</option>
          <option value="remedy">{t.remedy}</option>
          <option value="escalate">{t.escalate}</option>
        </select>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? t.submitting : t.submit}
      </button>
      {error ? <p className="error">{errorLabel}</p> : null}
    </form>
  );
}
