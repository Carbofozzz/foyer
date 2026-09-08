"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import { TechCard } from "@/app/components/tech-card";
import type { Messages } from "@/lib/i18n/load";
import type { WakeKind } from "@/lib/protocol/types";

type IssuedAgent = {
  id: string;
  name: string;
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
  wake: WakeKind;
  callback_url: string | null;
  hook_ok: boolean;
  callback_secret?: string | null;
};

type ConnectPayload = {
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
  prompt_lines: string[];
  name?: string;
  wake?: WakeKind;
  callback_url?: string | null;
  hook_ok?: boolean;
};

const WAKES: WakeKind[] = ["outbound", "callback"];

function agentFromPreview(preview: ConnectPayload): IssuedAgent {
  return {
    id: "demo",
    name: preview.name ?? "Travel",
    agent_key: preview.agent_key,
    mcp_url: preview.mcp_url,
    mcp_config: preview.mcp_config,
    wake: preview.wake ?? "outbound",
    callback_url: preview.callback_url ?? null,
    hook_ok: preview.hook_ok ?? false,
  };
}

export function ConnectCard({
  token,
  houseId,
  t,
  tech,
  errorLabel,
  asWizard,
  compact,
  preview = null,
}: {
  token: string;
  houseId?: string;
  t: Messages["connect"];
  tech: Messages["tech"];
  errorLabel: string;
  asWizard?: boolean;
  compact?: boolean;
  preview?: ConnectPayload | null;
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<IssuedAgent[]>(() => (preview ? [agentFromPreview(preview)] : []));
  const [promptLines, setPromptLines] = useState<string[]>(() => preview?.prompt_lines ?? []);
  const [selected, setSelected] = useState<string>(() => (preview ? "demo" : ""));
  const [name, setName] = useState("");
  const [wake, setWake] = useState<WakeKind>("outbound");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [callbackSecret, setCallbackSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(preview));

  useEffect(() => {
    if (preview) {
      setAgents([agentFromPreview(preview)]);
      setPromptLines(preview.prompt_lines);
      setSelected("demo");
      return;
    }
    fetch(`/api/cabinet/${token}/connect`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{
          data: { agents: IssuedAgent[]; prompt_lines: string[] };
        }>;
      })
      .then((payload) => {
        setAgents(payload.data.agents);
        setPromptLines(payload.data.prompt_lines);
        setSelected(payload.data.agents[0]?.id ?? "");
        setLoaded(true);
      })
      .catch(() => {
        setError(errorLabel);
        setLoaded(true);
      });
  }, [preview, token, houseId, errorLabel]);

  const current = agents.find((row) => row.id === selected) ?? agents[0] ?? null;
  const onlyOutbound = agents.length > 0 && agents.every((row) => row.wake === "outbound");

  async function issue() {
    if (preview) return;
    if (wake === "callback" && !callbackUrl.trim()) {
      setError(t.callbackNeed);
      return;
    }
    setPending(true);
    setError(null);
    const response = await fetch(`/api/cabinet/${token}/connect`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({
        name,
        wake,
        callback_url: wake === "callback" ? callbackUrl.trim() : undefined,
        callback_secret: wake === "callback" && callbackSecret.trim() ? callbackSecret.trim() : undefined,
      }),
    });
    if (!response.ok) {
      setPending(false);
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = payload?.error?.message ?? "";
      setError(message.includes("required") ? t.callbackNeed : errorLabel);
      return;
    }
    const payload = (await response.json()) as { data: IssuedAgent & { prompt_lines?: string[] } };
    const next = payload.data;
    setAgents((rows) => {
      const without = rows.filter((row) => row.id !== next.id);
      return [...without, next];
    });
    setSelected(next.id);
    setName("");
    setCallbackUrl("");
    setCallbackSecret("");
    setPending(false);
    if (asWizard) {
      window.location.reload();
      return;
    }
    router.refresh();
  }

  async function finish() {
    setPending(true);
    const response = await fetch(`/api/cabinet/${token}/connect`, {
      method: "POST",
      headers: cabinetHeaders(houseId),
    });
    if (!response.ok) {
      setPending(false);
      setError(errorLabel);
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
      {onlyOutbound || agents.length === 0 ? <p className="hint">{t.hostedOffer}</p> : null}
      <p className="feed-label">{t.list}</p>
      {!loaded ? (
        <p className="muted">{t.loading}</p>
      ) : (
        <ul className="agent-chips">
          {agents.map((row) => (
            <li key={row.id} className={row.id === current?.id ? "agent-live" : "agent-wait"}>
              <button
                type="button"
                aria-pressed={row.id === current?.id}
                onClick={() => setSelected(row.id)}
              >
                {row.name}
                <span className="agent-door">
                  {" "}
                  · {wakeLabel(row.wake, t)}
                  {row.wake === "callback" ? ` · ${row.hook_ok ? t.hookOk : t.hookMissing}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview ? null : (
        <form
          className="connect-add"
          onSubmit={(event) => {
            event.preventDefault();
            void issue();
          }}
        >
          <input
            type="text"
            value={name}
            required
            placeholder={t.namePlaceholder}
            aria-label={t.nameLabel}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="segmented" role="group" aria-label={t.wakeLabel}>
            {WAKES.map((kind) => (
              <button
                key={kind}
                type="button"
                className={wake === kind ? "segment is-active" : "segment"}
                aria-pressed={wake === kind}
                onClick={() => setWake(kind)}
              >
                {wakeLabel(kind, t)}
              </button>
            ))}
          </div>
          <p className="hint">
            {wake === "callback" ? t.wakeHintCallback : t.wakeHintOutbound}
          </p>
          {wake === "callback" ? (
            <>
              <input
                type="url"
                value={callbackUrl}
                placeholder={t.callbackUrlPlaceholder}
                aria-label={t.callbackUrlLabel}
                onChange={(event) => setCallbackUrl(event.target.value)}
              />
              <input
                type="text"
                value={callbackSecret}
                placeholder={t.callbackSecretPlaceholder}
                aria-label={t.callbackSecretLabel}
                autoComplete="off"
                onChange={(event) => setCallbackSecret(event.target.value)}
              />
            </>
          ) : null}
          <button type="submit" disabled={pending || !name.trim()} aria-busy={pending}>
            {pending ? t.issuing : t.issue}
          </button>
        </form>
      )}
      {loaded && agents.length === 0 ? <p className="empty">{t.empty}</p> : null}
      {current ? (
        <>
          <p className="feed-label">
            {t.pick} {current.name}
            <span className="agent-door">
              {" "}
              · {wakeLabel(current.wake, t)}
              {current.wake === "callback" ? ` · ${current.hook_ok ? t.hookOk : t.hookMissing}` : ""}
            </span>
          </p>
          {current.wake === "hosted" ? (
            <p className="hint">{t.hostedNote}</p>
          ) : (
            <>
              <p className="hint">{t.offTools}</p>
              {current.callback_url ? (
                <p className="mono snippet">{current.callback_url}</p>
              ) : null}
              {current.callback_secret ? (
                <div>
                  <p className="feed-label">{t.callbackSecretLabel}</p>
                  <pre className="mono snippet">{current.callback_secret}</pre>
                  <CopyButton text={current.callback_secret} copyLabel={t.copy} copiedLabel={t.copied} />
                </div>
              ) : null}
              <div>
                <p className="feed-label">{t.configLabel}</p>
                <pre className="mono snippet">{current.mcp_config}</pre>
                <CopyButton text={current.mcp_config} copyLabel={t.copy} copiedLabel={t.copied} />
              </div>
              <div>
                <p className="feed-label">{t.promptLabel}</p>
                <pre className="mono snippet">{promptLines.join("\n")}</pre>
                <CopyButton text={promptLines.join("\n")} copyLabel={t.copy} copiedLabel={t.copied} />
              </div>
            </>
          )}
          {current.wake === "hosted" ? null : (
            <details>
              <summary>{t.advanced}</summary>
              <TechCard token={token} houseId={houseId} t={tech} errorLabel={errorLabel} preview={current} />
            </details>
          )}
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {asWizard ? (
        <div className="row">
          <button type="button" className="ghost" disabled={pending} aria-busy={pending} onClick={() => void finish()}>
            {t.skip}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function wakeLabel(wake: WakeKind, t: Messages["connect"]) {
  if (wake === "callback") return t.wakeCallback;
  if (wake === "hosted") return t.wakeHosted;
  return t.wakeOutbound;
}
