"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import { TechCard } from "@/app/components/tech-card";
import { useCabinetTab } from "@/app/lib/use-cabinet-tab";
import type { Messages } from "@/lib/i18n/load";
import { AGENT_PROMPT_MAX, defaultAgentPrompt } from "@/lib/mcp/config";
import type { WakeKind } from "@/lib/protocol/types";
import { HOUSE_EVENT } from "@/lib/wallet/events";

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
  prompt?: string;
  prompt_lines?: string[];
  court_label?: string;
  court_cap?: string;
  sign_secret?: string;
  key_gen?: number;
  prompt_sha?: string;
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

export function ConnectIssueFields({
  t,
  name,
  wake,
  callbackUrl,
  callbackSecret,
  prompt,
  onName,
  onWake,
  onCallbackUrl,
  onCallbackSecret,
  onPrompt,
  courtLabel,
  courtCap,
  onCourtLabel,
  onCourtCap,
  showIssue = true,
  pending = false,
  onIssue,
  houseType = "personal",
}: {
  t: Messages["connect"];
  name: string;
  wake: WakeKind;
  callbackUrl: string;
  callbackSecret: string;
  prompt: string;
  onName: (value: string) => void;
  onWake: (value: WakeKind) => void;
  onCallbackUrl: (value: string) => void;
  onCallbackSecret: (value: string) => void;
  onPrompt: (value: string) => void;
  courtLabel?: string;
  courtCap?: string;
  onCourtLabel?: (value: string) => void;
  onCourtCap?: (value: string) => void;
  showIssue?: boolean;
  pending?: boolean;
  onIssue?: () => void;
  houseType?: "personal" | "org";
}) {
  return (
    <div className="connect-add">
      <label className="connect-field">
        <span>{t.nameLabel}</span>
        <input
          type="text"
          value={name}
          required={showIssue}
          placeholder={houseType === "org" ? t.namePlaceholderOrg : t.namePlaceholder}
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      {onCourtLabel && onCourtCap ? (
        <div className="connect-desk">
          <label className="connect-field">
            <span>{t.courtLabel}</span>
            <input
              type="text"
              value={courtLabel ?? ""}
              maxLength={80}
              placeholder={t.courtLabelPlaceholder}
              onChange={(event) => onCourtLabel(event.target.value)}
            />
          </label>
          <label className="connect-field">
            <span>{t.courtCap}</span>
            <input
              type="text"
              value={courtCap ?? ""}
              maxLength={200}
              placeholder={t.courtCapPlaceholder}
              onChange={(event) => onCourtCap(event.target.value)}
            />
          </label>
          <p className="hint">{t.courtHint}</p>
        </div>
      ) : null}
      <div className="connect-field">
        <span>{t.wakeLabel}</span>
        <div className="segmented" role="group" aria-label={t.wakeLabel}>
          {WAKES.map((kind) => (
            <button
              key={kind}
              type="button"
              className={wake === kind ? "segment is-active" : "segment"}
              aria-pressed={wake === kind}
              onClick={() => onWake(kind)}
            >
              {wakeLabel(kind, t)}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">{wake === "callback" ? t.wakeHintCallback : t.wakeHintOutbound}</p>
      {wake === "callback" ? (
        <>
          <label className="connect-field">
            <span>{t.callbackUrlLabel}</span>
            <input
              type="url"
              value={callbackUrl}
              placeholder={t.callbackUrlPlaceholder}
              onChange={(event) => onCallbackUrl(event.target.value)}
            />
          </label>
          <label className="connect-field">
            <span>{t.callbackSecretLabel}</span>
            <input
              type="text"
              value={callbackSecret}
              placeholder={t.callbackSecretPlaceholder}
              autoComplete="off"
              onChange={(event) => onCallbackSecret(event.target.value)}
            />
          </label>
        </>
      ) : null}
      <label className="connect-field connect-field-wide">
        <span>{t.promptLabel}</span>
        <textarea
          value={prompt}
          rows={8}
          maxLength={AGENT_PROMPT_MAX}
          onChange={(event) => onPrompt(event.target.value)}
        />
      </label>
      <p className="hint">{t.promptHint}</p>
      {showIssue ? (
        <div className="connect-field connect-field-action">
          <span aria-hidden="true">&nbsp;</span>
          <button type="button" disabled={pending || !name.trim()} aria-busy={pending} onClick={onIssue}>
            {pending ? t.issuing : t.issue}
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
    prompt: "",
    prompt_lines: preview.prompt_lines,
  };
}

export function ConnectCard({
  token,
  houseId,
  t,
  tech,
  errorLabel,
  compact,
  preview = null,
  houseType = "personal",
}: {
  token: string;
  houseId?: string;
  t: Messages["connect"];
  tech: Messages["tech"];
  errorLabel: string;
  compact?: boolean;
  preview?: ConnectPayload | null;
  houseType?: "personal" | "org";
}) {
  const router = useRouter();
  const connectTab = useCabinetTab("connect");
  const [agents, setAgents] = useState<IssuedAgent[]>(() => (preview ? [agentFromPreview(preview)] : []));
  const [selected, setSelected] = useState<string>(() => (preview ? "demo" : ""));
  const [name, setName] = useState("");
  const [wake, setWake] = useState<WakeKind>("outbound");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [callbackSecret, setCallbackSecret] = useState("");
  const [deskPrompt, setDeskPrompt] = useState(defaultAgentPrompt);
  const [issueLabel, setIssueLabel] = useState("");
  const [issueCap, setIssueCap] = useState("");
  const [selectedDesk, setSelectedDesk] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedCap, setSelectedCap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(preview));

  const load = useCallback(() => {
    if (preview) {
      setAgents([agentFromPreview(preview)]);
      setSelected("demo");
      setLoaded(true);
      return;
    }
    fetch(`/api/cabinet/${token}/connect`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{
          data: { agents: IssuedAgent[] };
        }>;
      })
      .then((payload) => {
        setAgents(payload.data.agents);
        setSelected((id) =>
          payload.data.agents.some((row) => row.id === id) ? id : (payload.data.agents[0]?.id ?? ""),
        );
        setLoaded(true);
      })
      .catch(() => {
        setError(errorLabel);
        setLoaded(true);
      });
  }, [preview, token, houseId, errorLabel]);

  useEffect(() => {
    if (preview) {
      load();
      return;
    }
    if (!connectTab) return;
    load();
    function onHouse() {
      load();
    }
    window.addEventListener(HOUSE_EVENT, onHouse);
    return () => window.removeEventListener(HOUSE_EVENT, onHouse);
  }, [preview, connectTab, load]);

  const current = agents.find((row) => row.id === selected) ?? agents[0] ?? null;
  const storedDesk = current ? current.prompt || defaultAgentPrompt() : "";
  const storedLabel = current?.court_label ?? "";
  const storedCap = current?.court_cap ?? "";
  const pasteText = preview ? storedDesk : selectedDesk;
  const deskDirty =
    Boolean(current) &&
    (selectedDesk.trim() !== storedDesk.trim() ||
      (houseType === "org" &&
        (selectedLabel.trim() !== storedLabel.trim() || selectedCap.trim() !== storedCap.trim())));

  useEffect(() => {
    setSelectedDesk(current ? current.prompt || defaultAgentPrompt() : defaultAgentPrompt());
    setSelectedLabel(current?.court_label ?? "");
    setSelectedCap(current?.court_cap ?? "");
  }, [current?.id, current?.prompt, current?.court_label, current?.court_cap]);

  async function saveDesk() {
    if (preview || !current) return;
    setSavingPrompt(true);
    setError(null);
    const response = await fetch(`/api/cabinet/${token}/connect`, {
      method: "PATCH",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({
        id: current.id,
        prompt: selectedDesk,
        ...(houseType === "org" ? { court_label: selectedLabel, court_cap: selectedCap } : {}),
      }),
    });
    setSavingPrompt(false);
    if (!response.ok) {
      setError(errorLabel);
      return;
    }
    const payload = (await response.json()) as {
      data: IssuedAgent & { prompt: string; prompt_lines: string[]; court_label?: string; court_cap?: string };
    };
    setAgents((rows) =>
      rows.map((row) =>
        row.id === current.id
          ? {
              ...row,
              ...payload.data,
            }
          : row,
      ),
    );
  }

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
        prompt: deskPrompt,
        ...(houseType === "org" ? { court_label: issueLabel, court_cap: issueCap } : {}),
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
    setDeskPrompt(defaultAgentPrompt());
    setIssueLabel("");
    setIssueCap("");
    setPending(false);
    router.refresh();
  }

  async function rotate() {
    if (preview || !current) return;
    setRotating(true);
    setError(null);
    const response = await fetch(`/api/cabinet/${token}/connect`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ id: current.id, rotate: true }),
    });
    setRotating(false);
    if (!response.ok) {
      setError(errorLabel);
      return;
    }
    const payload = (await response.json()) as { data: IssuedAgent };
    setAgents((rows) => rows.map((row) => (row.id === payload.data.id ? payload.data : row)));
  }

  return (
    <section className={compact ? "stack" : "card stack"}>
      {compact ? null : <h2 className="section-title">{t.title}</h2>}
      <p className="hint">{t.lead}</p>
      {houseType === "org" ? <p className="hint">{t.promptOrgHint}</p> : null}
      {preview ? null : (
        <div className="connect-issue">
          <p className="feed-label">{t.another}</p>
          <ConnectIssueFields
            t={t}
            name={name}
            wake={wake}
            callbackUrl={callbackUrl}
            callbackSecret={callbackSecret}
            onName={setName}
            onWake={setWake}
            onCallbackUrl={setCallbackUrl}
            onCallbackSecret={setCallbackSecret}
            prompt={deskPrompt}
            onPrompt={setDeskPrompt}
            courtLabel={houseType === "org" ? issueLabel : undefined}
            courtCap={houseType === "org" ? issueCap : undefined}
            onCourtLabel={houseType === "org" ? setIssueLabel : undefined}
            onCourtCap={houseType === "org" ? setIssueCap : undefined}
            pending={pending}
            onIssue={() => void issue()}
            houseType={houseType}
          />
        </div>
      )}
      <p className="feed-label">{t.list}</p>
      {!loaded ? (
        <p className="muted">{t.loading}</p>
      ) : agents.length === 0 ? (
        <p className="empty">{t.empty}</p>
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
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {current ? (
        <div className="connect-current">
          <p className="feed-label">
            {t.pick} <span className="feed-label-name">{current.name}</span>
            <span className="agent-door">
              {" "}
              · {wakeLabel(current.wake, t)}
            </span>
          </p>
          {current.wake === "hosted" ? (
            <p className="hint">{t.hostedNote}</p>
          ) : (
            <>
              <p className="hint">{current.wake === "callback" ? t.offToolsHook : t.offTools}</p>
              {current.wake === "callback" && current.callback_url ? (
                <div className="connect-field">
                  <span>{t.callbackUrlLabel}</span>
                  <p className="mono snippet">{current.callback_url}</p>
                </div>
              ) : null}
              {current.wake === "callback" && current.callback_secret ? (
                <div className="connect-field">
                  <span>{t.callbackSecretLabel}</span>
                  <pre className="mono snippet">{current.callback_secret}</pre>
                  <CopyButton text={current.callback_secret} copyLabel={t.copy} copiedLabel={t.copied} />
                </div>
              ) : null}
              <div>
                <p className="feed-label">{t.configLabel}</p>
                <pre className="mono snippet">{current.mcp_config}</pre>
                <CopyButton text={current.mcp_config} copyLabel={t.copy} copiedLabel={t.copied} />
                {preview ? null : (
                  <>
                    <p className="hint">{t.rotateHint}</p>
                    <button
                      type="button"
                      className="ghost"
                      disabled={rotating}
                      aria-busy={rotating}
                      onClick={() => void rotate()}
                    >
                      {rotating ? t.rotating : t.rotate}
                    </button>
                  </>
                )}
              </div>
              <div>
                <p className="feed-label">{t.promptLabel}</p>
                {preview ? (
                  <pre className="mono snippet">{pasteText}</pre>
                ) : (
                  <textarea
                    className="charter-edit"
                    value={selectedDesk}
                    rows={8}
                    maxLength={AGENT_PROMPT_MAX}
                    onChange={(event) => setSelectedDesk(event.target.value)}
                  />
                )}
                <p className="hint">{t.promptHint}</p>
                {preview ? null : <p className="hint">{t.promptPinHint}</p>}
                {preview ? null : (
                  <>
                    {houseType === "org" ? (
                    <div className="connect-desk">
                      <label className="connect-field">
                        <span>{t.courtLabel}</span>
                        <input
                          type="text"
                          value={selectedLabel}
                          maxLength={80}
                          placeholder={t.courtLabelPlaceholder}
                          onChange={(event) => setSelectedLabel(event.target.value)}
                        />
                      </label>
                      <label className="connect-field">
                        <span>{t.courtCap}</span>
                        <input
                          type="text"
                          value={selectedCap}
                          maxLength={200}
                          placeholder={t.courtCapPlaceholder}
                          onChange={(event) => setSelectedCap(event.target.value)}
                        />
                      </label>
                      <p className="hint">{t.courtHint}</p>
                    </div>
                    ) : null}
                    <button
                      type="button"
                      className="ghost"
                      disabled={savingPrompt || !deskDirty}
                      aria-busy={savingPrompt}
                      onClick={() => void saveDesk()}
                    >
                      {savingPrompt ? t.promptSaving : t.promptSave}
                    </button>
                  </>
                )}
                <CopyButton text={pasteText} copyLabel={t.copy} copiedLabel={t.copied} />
              </div>
            </>
          )}
          {current.wake === "hosted" ? null : (
            <details>
              <summary>{t.advanced}</summary>
              <TechCard token={token} houseId={houseId} t={tech} errorLabel={errorLabel} preview={current} />
            </details>
          )}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

function wakeLabel(wake: WakeKind, t: Messages["connect"]) {
  if (wake === "callback") return t.wakeCallback;
  if (wake === "hosted") return t.wakeHosted;
  return t.wakeOutbound;
}
