"use client";

import { useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import type { Messages } from "@/lib/i18n/load";
import { PILOT_HANDS } from "@/lib/lock/hands";
import { BROKER_GROUPS, GROUP_SETUP, type BrokerGroup } from "@/lib/lock/catalog";
import { brokerHttpCommand, brokerMcpConfig } from "@/lib/lock/snippet";

export function LockCard({
  token,
  houseId,
  origin,
  agentKey,
  agentId,
  locale,
  t,
  protocol,
  preview,
}: {
  token: string;
  houseId?: string;
  origin: string;
  agentKey: string;
  agentId: string;
  locale: string;
  protocol: string;
  t: Messages["lock"];
  preview?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hands, setHands] = useState<string[]>(["git.push", "pay.x402"]);
  const [group, setGroup] = useState<BrokerGroup>("mcp");
  const handLabel: Record<string, string> = {
    "git.push": t.handGit,
    "pay.x402": t.handX402,
    "pay.ap2": t.handAp2,
  };
  const groupCopy: Record<BrokerGroup, { title: string; lead: string }> = {
    mcp: { title: t.groupMcp, lead: t.groupMcpLead },
    http: { title: t.groupHttp, lead: t.groupHttpLead },
    plugin: { title: t.groupPlugin, lead: t.groupPluginLead },
    extension: { title: t.groupExtension, lead: t.groupExtensionLead },
    cloud: { title: t.groupCloud, lead: t.groupCloudLead },
    hosted: { title: t.groupHosted, lead: t.groupHostedLead },
  };
  const chosen = GROUP_SETUP[group];
  const ordered = PILOT_HANDS.filter((hand) => hands.includes(hand));
  const setup = { origin, agentKey, hands: ordered, path: "foyer-lock.mjs", gitDir: "" };
  const snippet =
    chosen.form === "http"
      ? brokerHttpCommand(setup)
      : chosen.form === "program"
        ? brokerMcpConfig(protocol, setup)
        : "";

  useEffect(() => {
    if (preview) return;
    fetch(`/api/cabinet/${token}/lock`, { headers: cabinetHeaders(houseId) })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { hands?: string[] } } | null) => {
        if (body?.data?.hands) setHands(body.data.hands);
      })
      .catch(() => setNote(t.saveFail));
  }, [preview, token, houseId, t.saveFail]);

  async function toggle(hand: string) {
    const next = hands.includes(hand) ? hands.filter((item) => item !== hand) : [...hands, hand];
    setHands(next);
    setNote(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/lock`, {
        method: "POST",
        headers: { "content-type": "application/json", ...cabinetHeaders(houseId) },
        body: JSON.stringify({ hands: next }),
      });
      if (!response.ok) setNote(t.saveFail);
    } catch {
      setNote(t.saveFail);
    }
  }

  async function downloadJournal() {
    setNote(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/grants`, { headers: cabinetHeaders(houseId) });
      if (!response.ok) {
        setNote(t.revokeFail);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "foyer-grants.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote(t.revokeFail);
    }
  }

  async function revoke() {
    setPending(true);
    setNote(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/grants`, {
        method: "POST",
        headers: { "content-type": "application/json", ...cabinetHeaders(houseId) },
        body: JSON.stringify({ scope: "agent", agent_id: agentId }),
      });
      const body = (await response.json()) as { data?: { revoked?: number } };
      setNote(response.ok ? t.revoked.replace("{n}", String(body.data?.revoked ?? 0)) : t.revokeFail);
    } catch {
      setNote(t.revokeFail);
    } finally {
      setPending(false);
    }
  }

  const paste = chosen.ready ? snippet : protocol;

  return (
    <section className="connect-step">
      <p className="feed-label">{t.shopTitle}</p>
      <p className="hint">{t.shopLead}</p>
      <p className="hint">
        <a href={`/${locale}/guide`}>{t.guideLink}</a>
      </p>
      <fieldset className="lock-hands" aria-label={t.hands}>
        {PILOT_HANDS.map((hand) => (
          <label key={hand} className="check-row">
            <input
              type="checkbox"
              checked={hands.includes(hand)}
              disabled={Boolean(preview)}
              onChange={() => void toggle(hand)}
            />
            {handLabel[hand]}
          </label>
        ))}
      </fieldset>
      <p className="hint">{t.lead}</p>
      <div className="store-grid">
        {BROKER_GROUPS.map((id) => {
          const row = GROUP_SETUP[id];
          return (
            <button
              key={id}
              type="button"
              className={id === group ? "store-card is-active" : "store-card"}
              aria-pressed={id === group}
              onClick={() => setGroup(id)}
            >
              <span className="store-card-head">
                {groupCopy[id].title}
                <span className={row.ready ? "store-ready" : "store-soon"}>{row.ready ? t.ready : t.soon}</span>
              </span>
              <span className="hint">{groupCopy[id].lead}</span>
            </button>
          );
        })}
      </div>
      <div className="paste-box">
        {chosen.ready ? (
          <ol className="guide-steps">
            {(chosen.form === "http" ? t.httpSteps : t.programSteps).map((step) => (
              <li key={step}>{step}</li>
            ))}
            {hands.includes("git.push")
              ? t.gitSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))
              : null}
            {hands.includes("pay.x402")
              ? t.paySteps.map((step) => (
                  <li key={step}>{step}</li>
                ))
              : null}
            {hands.includes("pay.ap2")
              ? t.signSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))
              : null}
            {chosen.terminal ? <li>{t.terminalNote}</li> : null}
          </ol>
        ) : (
          <p className="hint">{t.soonPaste}</p>
        )}
        <details>
          <summary>{t.showBlock}</summary>
          <pre className="mono snippet">{paste}</pre>
        </details>
        <div className="paste-bar">
          {chosen.ready ? (
            <a className="ghost" href="/api/lock-broker" download="foyer-lock.mjs">
              {t.downloadFile}
            </a>
          ) : (
            <span />
          )}
          <CopyButton text={paste} copyLabel={t.copy} copiedLabel={t.copied} />
        </div>
      </div>
      {preview ? null : (
        <div className="lock-actions">
          <button type="button" className="ghost" disabled={pending} aria-busy={pending} onClick={() => void revoke()}>
            {pending ? t.revoking : t.revoke}
          </button>
          <button type="button" className="ghost" onClick={() => void downloadJournal()}>
            {t.exportJournal}
          </button>
        </div>
      )}
      {note ? <p className="hint">{note}</p> : null}
    </section>
  );
}

export function WhyButton({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={open ? "ask is-open" : "ask"} aria-expanded={open} aria-label={label} onClick={onClick}>
      ?
    </button>
  );
}
