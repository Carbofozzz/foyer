"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/app/components/copy-button";
import type { Messages } from "@/lib/i18n/load";

type ConnectPayload = {
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
  prompt_lines: string[];
};

type Runtime = "cursor" | "claude" | "chatgpt" | "openclaw";

const RUNTIMES: Runtime[] = ["cursor", "claude", "chatgpt", "openclaw"];

export function ConnectCard({
  token,
  t,
  errorLabel,
  asWizard,
  compact,
}: {
  token: string;
  t: Messages["connect"];
  errorLabel: string;
  asWizard?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [runtime, setRuntime] = useState<Runtime>("cursor");

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
    <section className={compact ? "stack" : "card stack"}>
      {asWizard ? (
        <div className="cabinet-panel-head">
          <h2 className="section-title">{t.title}</h2>
          <p className="kicker">{t.kicker}</p>
        </div>
      ) : compact ? null : (
        <h2 className="section-title">{t.title}</h2>
      )}
      {compact ? null : (
        <>
          <div className="runtime-tabs">
            {RUNTIMES.map((id) => (
              <button
                key={id}
                type="button"
                className={id === runtime ? "primary" : "ghost"}
                onClick={() => setRuntime(id)}
              >
                {runtimeLabel(id, t)}
              </button>
            ))}
          </div>
          <p className="hint">{runtimeLead(runtime, t)}</p>
          <p>{t.offTools}</p>
        </>
      )}
      {data ? (
        <>
          <label>
            {t.configLabel}
            <textarea readOnly rows={compact ? 5 : 8} value={data.mcp_config} />
          </label>
          <CopyButton text={data.mcp_config} copyLabel={t.copy} copiedLabel={t.copied} />
          <label>
            {t.promptLabel}
            <textarea readOnly rows={3} value={data.prompt_lines.join("\n")} />
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

function runtimeLabel(id: Runtime, t: Messages["connect"]) {
  if (id === "claude") return t.runtimeClaude;
  if (id === "chatgpt") return t.runtimeChatgpt;
  if (id === "openclaw") return t.runtimeOpenclaw;
  return t.runtimeCursor;
}

function runtimeLead(id: Runtime, t: Messages["connect"]) {
  if (id === "claude") return t.leadClaude;
  if (id === "chatgpt") return t.leadChatgpt;
  if (id === "openclaw") return t.leadOpenclaw;
  return t.leadCursor;
}
