"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import { TechCard } from "@/app/components/tech-card";
import type { Messages } from "@/lib/i18n/load";

type IssuedAgent = {
  id: string;
  name: string;
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
};

type ConnectPayload = {
  agent_key: string;
  mcp_url: string;
  mcp_config: string;
  prompt_lines: string[];
  name?: string;
};

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
  const [agents, setAgents] = useState<IssuedAgent[]>([]);
  const [promptLines, setPromptLines] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(preview));

  useEffect(() => {
    if (preview) {
      const id = "demo";
      setAgents([
        {
          id,
          name: preview.name ?? "Travel",
          agent_key: preview.agent_key,
          mcp_url: preview.mcp_url,
          mcp_config: preview.mcp_config,
        },
      ]);
      setPromptLines(preview.prompt_lines);
      setSelected(id);
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
        setError(true);
        setLoaded(true);
      });
  }, [preview, token, houseId]);

  const current = agents.find((row) => row.id === selected) ?? agents[0] ?? null;

  async function issue() {
    if (preview) return;
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/connect`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      setPending(false);
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: IssuedAgent & { prompt_lines?: string[] } };
    const next = payload.data;
    setAgents((rows) => {
      if (rows.some((row) => row.id === next.id)) return rows;
      return [...rows, next];
    });
    setSelected(next.id);
    setName("");
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
          </p>
          <p className="hint">{t.offTools}</p>
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
          <details>
            <summary>{t.advanced}</summary>
            <TechCard token={token} houseId={houseId} t={tech} errorLabel={errorLabel} preview={current} />
          </details>
        </>
      ) : null}
      {error ? <p className="error">{errorLabel}</p> : null}
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
