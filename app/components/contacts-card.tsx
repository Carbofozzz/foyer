"use client";

import { useEffect, useRef, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";

type ContactsData = {
  email: string | null;
  email_verified: boolean;
  telegram: boolean;
  telegram_handle?: string | null;
  telegram_url?: string | null;
  telegram_configured?: boolean;
};

export function ContactsCard({
  token,
  houseId,
  locale,
  canEdit,
  locked = false,
  preview = null,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  locale: string;
  canEdit: boolean;
  locked?: boolean;
  preview?: ContactsData | null;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [email, setEmail] = useState(preview?.email ?? "");
  const [verified, setVerified] = useState(Boolean(preview?.email_verified));
  const [telegram, setTelegram] = useState(Boolean(preview?.telegram));
  const [telegramHandle, setTelegramHandle] = useState<string | null>(preview?.telegram_handle ?? null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(preview?.telegram_url ?? null);
  const [configured, setConfigured] = useState<boolean | null>(preview ? Boolean(preview.telegram_configured) : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [waitTelegram, setWaitTelegram] = useState(false);
  const linkedRef = useRef(Boolean(preview?.telegram));
  linkedRef.current = telegram;

  useEffect(() => {
    if (preview || locked) return;
    function apply(data: ContactsData) {
      setEmail(data.email ?? "");
      setVerified(data.email_verified);
      setTelegram(data.telegram);
      setTelegramHandle(data.telegram_handle ?? null);
      setTelegramUrl(data.telegram_url ?? null);
      setConfigured(data.telegram_configured !== false);
      if (data.telegram) setWaitTelegram(false);
      setError(false);
    }
    function load(wake: boolean) {
      const q = wake ? "?wake=1" : "";
      fetch(`/api/cabinet/${token}/contacts${q}`, { headers: cabinetHeaders(houseId) })
        .then((response) => {
          if (!response.ok) throw new Error("fail");
          return response.json() as Promise<{ data: ContactsData }>;
        })
        .then((payload) => apply(payload.data))
        .catch(() => setError(true));
    }
    load(true);
    function onVis() {
      if (document.visibilityState === "visible") load(true);
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const tick = window.setInterval(() => load(!linkedRef.current), 4000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.clearInterval(tick);
    };
  }, [preview, locked, token, houseId]);

  async function save() {
    setPending(true);
    setError(false);
    setHint(null);
    const response = await fetch(`/api/cabinet/${token}/contacts`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ email, locale }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as {
      data: ContactsData & { confirmQueued?: boolean };
    };
    setEmail(payload.data.email ?? "");
    setVerified(Boolean(payload.data.email_verified));
    setTelegram(Boolean(payload.data.telegram));
    setTelegramHandle(payload.data.telegram_handle ?? null);
    setTelegramUrl(payload.data.telegram_url ?? null);
    if (payload.data.confirmQueued) setHint(t.contactsSent);
  }

  async function resend() {
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/contacts`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ resend: true, locale }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    setHint(t.contactsSent);
  }

  async function unlink() {
    setPending(true);
    setError(false);
    const response = await fetch(`/api/cabinet/${token}/contacts`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ unlink_telegram: true }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: ContactsData };
    setTelegram(Boolean(payload.data.telegram));
    setTelegramHandle(payload.data.telegram_handle ?? null);
    setTelegramUrl(payload.data.telegram_url ?? null);
  }

  return (
    <div className="stack">
      <p className="hint">{t.contactsLead}</p>
      <div className="contact-channel">
        <label>
          {t.contactsEmail}
          <input
            type="email"
            value={email}
            disabled={locked || !canEdit}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>
        {email ? <p className="hint">{verified ? t.contactsVerified : t.contactsUnverified}</p> : null}
        {canEdit && !locked ? (
          <div className="wallet-actions">
            <button type="button" className="primary" disabled={pending} aria-busy={pending} onClick={() => void save()}>
              {pending ? t.contactsSaving : t.contactsSave}
            </button>
            {email && !verified ? (
              <button type="button" className="ghost" disabled={pending} onClick={() => void resend()}>
                {t.contactsResend}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="contact-channel">
        <label>
          {t.contactsTelegram}
          <input
            type="text"
            value={telegram ? displayTelegramName(telegramHandle ?? "") : ""}
            readOnly
            disabled={locked || !canEdit}
            autoComplete="off"
          />
        </label>
        {telegram ? <p className="hint">{t.contactsTelegramLinked}</p> : null}
        {waitTelegram && !telegram ? <p className="hint">{t.contactsTelegramWait}</p> : null}
        {!telegram && configured && !telegramUrl && canEdit && !locked ? (
          <p className="hint">{t.contactsTelegramOff}</p>
        ) : null}
        {configured === false ? <p className="hint">{locked ? t.contactsTelegramSoon : t.contactsTelegramOff}</p> : null}
        {telegram && canEdit && !locked ? (
          <div className="wallet-actions">
            <button type="button" className="ghost" disabled={pending} onClick={() => void unlink()}>
              {t.contactsTelegramUnlink}
            </button>
          </div>
        ) : null}
        {!telegram && telegramUrl && canEdit && !locked ? (
          <div className="wallet-actions">
            <a
              className="ghost"
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setWaitTelegram(true)}
            >
              {t.contactsTelegramOpen}
            </a>
          </div>
        ) : null}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="error">{errorLabel}</p> : null}
    </div>
  );
}

function displayTelegramName(raw: string) {
  const name = raw.trim();
  if (!name) return "";
  if (name.includes(" ")) return name;
  return name.startsWith("@") ? name : `@${name}`;
}
