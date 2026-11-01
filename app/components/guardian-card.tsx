"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";

export function GuardianCard({
  token,
  houseId,
  initial,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  initial: { name: string; llm_url: string; llm_model: string; has_key: boolean; addendum: string };
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initial.llm_url);
  const [model, setModel] = useState(initial.llm_model);
  const [key, setKey] = useState("");
  const [addendum, setAddendum] = useState(initial.addendum);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const usingOwn = Boolean(initial.llm_url && initial.llm_model && initial.has_key);

  async function save() {
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/guardian`, {
      method: "POST",
      headers: cabinetHeaders(houseId),
      body: JSON.stringify({
        llm_url: url,
        llm_model: model,
        llm_key: key,
        addendum,
      }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    setKey("");
    router.refresh();
  }

  return (
    <form
      className="card stack guardian-card"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="feed-label">{t.guardianTitle}</p>
      <p className="hint">
        {(usingOwn ? t.guardianLeadOwn : t.guardianLead)
          .replace("{model}", initial.llm_model || initial.llm_url)}
      </p>
      <div className="connect-issue">
        <p className="feed-label">{t.guardianOwnToggle}</p>
        <div className="guardian-fields">
          <p className="hint">{t.guardianOwnHint}</p>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setUrl("https://api.openai.com/v1")}>
              {t.guardianPresetOpenai}
            </button>
            <button type="button" className="ghost" onClick={() => setUrl("https://openrouter.ai/api/v1")}>
              {t.guardianPresetOpenrouter}
            </button>
          </div>
          <label className="connect-field">
            <span>{t.guardianUrl}</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          </label>
          <label className="connect-field">
            <span>{t.guardianModel}</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
          </label>
          <label className="connect-field">
            <span>{t.guardianKey}</span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={initial.has_key ? t.guardianKeySet : ""}
              autoComplete="off"
            />
          </label>
          <label className="connect-field">
            <span>{t.guardianAddendum}</span>
            <textarea value={addendum} onChange={(e) => setAddendum(e.target.value)} maxLength={500} rows={2} />
          </label>
        </div>
      </div>
      <button type="submit" className="ghost" disabled={pending} aria-busy={pending}>
        {t.guardianSave}
      </button>
      {error ? <p className="error">{errorLabel}</p> : null}
    </form>
  );
}
