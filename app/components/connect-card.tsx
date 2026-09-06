"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import type { Messages } from "@/lib/i18n/load";

type ConnectPayload = {
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
  prompt_lines: string[];
};

export function ConnectCard({
  token,
  houseId,
  t,
  errorLabel,
  asWizard,
  compact,
  preview = null,
}: {
  token: string;
  houseId?: string;
  t: Messages["connect"];
  errorLabel: string;
  asWizard?: boolean;
  compact?: boolean;
  preview?: ConnectPayload | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (preview) {
      setData(preview);
      return;
    }
    fetch(`/api/cabinet/${token}/connect`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: ConnectPayload }>;
      })
      .then((payload) => setData(payload.data))
      .catch(() => setError(true));
  }, [preview, token, houseId]);

  async function finish() {
    setPending(true);
    const response = await fetch(`/api/cabinet/${token}/connect`, {
      method: "POST",
      headers: cabinetHeaders(houseId),
    });
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
    <section className={compact ? "stack" : "card stack"}>
      {asWizard ? (
        <div className="cabinet-panel-head">
          <h2 className="section-title">{t.title}</h2>
          <p className="kicker">{t.kicker}</p>
        </div>
      ) : compact ? null : (
        <h2 className="section-title">{t.title}</h2>
      )}
      <p className="hint">{t.lead}</p>
      <p className="hint">{t.offTools}</p>
      {data ? (
        <>
          <div>
            <p className="feed-label">{t.configLabel}</p>
            <pre className="mono snippet">{data.mcp_config}</pre>
            <CopyButton text={data.mcp_config} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
          <div>
            <p className="feed-label">{t.promptLabel}</p>
            <pre className="mono snippet">{data.prompt_lines.join("\n")}</pre>
            <CopyButton text={data.prompt_lines.join("\n")} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
        </>
      ) : error ? (
        <p className="error">{errorLabel}</p>
      ) : (
        <p className="muted">{t.loading}</p>
      )}
      {asWizard ? (
        <div className="row">
          <button type="button" className="primary" disabled={pending || !data} aria-busy={pending} onClick={finish}>
            {pending ? t.loading : t.added}
          </button>
          <button type="button" className="ghost" disabled={pending} aria-busy={pending} onClick={finish}>
            {t.skip}
          </button>
        </div>
      ) : null}
    </section>
  );
}
