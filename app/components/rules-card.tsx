"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";
import { MCP_INBOX_POLL_SEC } from "@/lib/mcp/config";

export function RulesCard({
  token,
  houseId,
  constitution,
  collectWindowSec = 60,
  bargainWindowSec = 60,
  requireSignedWrites = false,
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
  collectWindowSec?: number;
  bargainWindowSec?: number;
  requireSignedWrites?: boolean;
  canEdit: boolean;
  locked?: boolean;
  enroll?: string;
  enrollLabel: string;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(constitution);
  const [collect, setCollect] = useState(String(collectWindowSec));
  const [bargain, setBargain] = useState(String(bargainWindowSec));
  const [requireSigned, setRequireSigned] = useState(requireSignedWrites);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const dirty =
    text.trim() !== constitution.trim() ||
    collect !== String(collectWindowSec) ||
    bargain !== String(bargainWindowSec) ||
    requireSigned !== requireSignedWrites;

  useEffect(() => {
    setText(constitution);
    setCollect(String(collectWindowSec));
    setBargain(String(bargainWindowSec));
    setRequireSigned(requireSignedWrites);
  }, [constitution, collectWindowSec, bargainWindowSec, requireSignedWrites]);

  async function save() {
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/constitution`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({
        constitution: text,
        collect_window_sec: Number(collect),
        bargain_window_sec: Number(bargain),
        require_signed_writes: requireSigned,
      }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  const bargainShort = Number(bargain) > 0 && Number(bargain) < MCP_INBOX_POLL_SEC * 2;

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
          <div className="connect-desk">
            <label className="connect-field">
              <span>{t.windowCollect}</span>
              <input
                type="number"
                min={10}
                max={86400}
                value={collect}
                disabled={locked}
                onChange={(event) => setCollect(event.target.value)}
              />
              <span className="hint">{t.windowCollectHint}</span>
            </label>
            <label className="connect-field">
              <span>{t.windowBargain}</span>
              <input
                type="number"
                min={10}
                max={86400}
                value={bargain}
                disabled={locked}
                onChange={(event) => setBargain(event.target.value)}
              />
              <span className="hint">{t.windowBargainHint}</span>
            </label>
            {bargainShort ? <p className="hint">{t.windowBargainChat}</p> : null}
          </div>
          <label className="connect-field">
            <span>
              <input
                type="checkbox"
                checked={requireSigned}
                disabled={locked}
                onChange={(event) => setRequireSigned(event.target.checked)}
              />{" "}
              {t.requireSigned}
            </span>
            <span className="hint">{t.requireSignedHint}</span>
          </label>
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
        <>
          <p className="charter">{constitution}</p>
          <p className="hint">
            {t.windowCollect}: {collectWindowSec}
            {t.windowSec} ·             {t.windowBargain}: {bargainWindowSec}
            {t.windowSec}
            {requireSignedWrites ? ` · ${t.requireSigned}` : ""}
          </p>
        </>
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
