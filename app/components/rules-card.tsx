"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";

export function RulesCard({
  token,
  houseId,
  constitution,
  canEdit,
  locked = false,
  enroll,
  enrollLabel,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  constitution: string;
  canEdit: boolean;
  locked?: boolean;
  enroll?: string;
  enrollLabel: string;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(constitution);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const dirty = text.trim() !== constitution.trim();

  useEffect(() => {
    setText(constitution);
  }, [constitution]);

  async function save() {
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/constitution`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ constitution: text }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack">
      {canEdit || locked ? (
        <>
          <p className="hint">{t.rulesHint}</p>
          <textarea
            className="charter-edit"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={12}
            disabled={locked}
          />
          <button
            type="button"
            className="primary"
            disabled={locked || pending || !text.trim() || !dirty}
            aria-busy={pending}
            onClick={() => void save()}
          >
            {pending ? t.savingRules : t.saveRules}
          </button>
        </>
      ) : (
        <p className="charter">{constitution}</p>
      )}
      {enroll ? (
        <>
          <p className="feed-label">{enrollLabel}</p>
          <p className="mono">{enroll}</p>
        </>
      ) : null}
      {error ? <p className="error">{errorLabel}</p> : null}
    </div>
  );
}
