"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/app/components/copy-button";
import type { Messages } from "@/lib/i18n/load";

type ConnectPayload = {
  agent_key: string;
  mcp_url: string;
  cursor_config: string;
  prompt_lines: string[];
};

export function ConnectCard({
  token,
  t,
  errorLabel,
  asWizard,
}: {
  token: string;
  t: Messages["connect"];
  errorLabel: string;
  asWizard?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch(`/api/cabinet/${token}/connect`)
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: ConnectPayload }>;
      })
      .then((payload) => setData(payload.data))
      .catch(() => setError(true));
  }, [token]);

  async function finish() {
    setPending(true);
    const response = await fetch(`/api/cabinet/${token}/connect`, { method: "POST" });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    if (asWizard) {
      window.location.reload();
      return;
    }
    router.refresh();
  }

  return (
    <section className="card stack">
      {asWizard ? <p className="kicker">{t.kicker}</p> : null}
      <h2 className="section-title">{t.title}</h2>
      <p className="hint">{t.lead}</p>
      <p>{t.offTools}</p>
      {data ? (
        <>
          <label>
            {t.configLabel}
            <textarea readOnly rows={12} value={data.cursor_config} />
          </label>
          <CopyButton text={data.cursor_config} copyLabel={t.copy} copiedLabel={t.copied} />
          <label>
            {t.promptLabel}
            <textarea readOnly rows={4} value={data.prompt_lines.join("\n")} />
          </label>
          <CopyButton text={data.prompt_lines.join("\n")} copyLabel={t.copy} copiedLabel={t.copied} />
        </>
      ) : error ? (
        <p className="error">{errorLabel}</p>
      ) : (
        <p className="muted">{t.loading}</p>
      )}
      {asWizard ? (
        <div className="row">
          <button type="button" className="primary" disabled={pending || !data} onClick={finish}>
            {pending ? t.loading : t.added}
          </button>
          <button type="button" className="ghost" disabled={pending} onClick={finish}>
            {t.skip}
          </button>
        </div>
      ) : null}
    </section>
  );
}
