"use client";

import { useEffect, useState } from "react";
import { OrgContactsCard } from "@/app/components/org-contacts-card";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { useCabinetTab } from "@/app/lib/use-cabinet-tab";
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
  houseType = "personal",
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  locale: string;
  canEdit: boolean;
  locked?: boolean;
  preview?: ContactsData | null;
  houseType?: "personal" | "org";
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  if (houseType === "org") {
    return (
      <OrgContactsCard
        token={token}
        houseId={houseId}
        locale={locale}
        canEdit={canEdit}
        locked={locked}
        t={t}
        errorLabel={errorLabel}
      />
    );
  }
  return (
    <PersonalContactsCard
      token={token}
      houseId={houseId}
      locale={locale}
      canEdit={canEdit}
      locked={locked}
      preview={preview}
      t={t}
      errorLabel={errorLabel}
    />
  );
}

function PersonalContactsCard({
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
  const [emailPending, setEmailPending] = useState(false);
  const [telegramPending, setTelegramPending] = useState(false);
  const [error, setError] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [waitTelegram, setWaitTelegram] = useState(false);
  const contactsTab = useCabinetTab("contacts");

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

  useEffect(() => {
    if (preview || locked || !contactsTab) return;
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
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [preview, locked, contactsTab, token, houseId]);

  useEffect(() => {
    if (preview || locked || !contactsTab) return;
    const waitingOwner = waitTelegram && !telegram;
    if (!waitingOwner) return;
    const tick = window.setInterval(() => {
      fetch(`/api/cabinet/${token}/contacts?wake=1`, { headers: cabinetHeaders(houseId) })
        .then((response) => {
          if (!response.ok) throw new Error("fail");
          return response.json() as Promise<{ data: ContactsData }>;
        })
        .then((payload) => apply(payload.data))
        .catch(() => setError(true));
    }, 4000);
    return () => window.clearInterval(tick);
  }, [preview, locked, contactsTab, telegram, waitTelegram, token, houseId]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/cabinet/${token}/contacts`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("fail");
    return (await response.json()) as { data: ContactsData & { confirmQueued?: boolean } };
  }

  async function save() {
    setEmailPending(true);
    setError(false);
    setHint(null);
    try {
      const payload = await post({ email, locale });
      apply(payload.data);
      if (payload.data.confirmQueued) setHint(t.contactsSent);
    } catch {
      setError(true);
    }
    setEmailPending(false);
  }

  async function resend() {
    setEmailPending(true);
    setError(false);
    try {
      await post({ resend: true, locale });
      setHint(t.contactsSent);
    } catch {
      setError(true);
    }
    setEmailPending(false);
  }

  async function unlink() {
    setTelegramPending(true);
    setError(false);
    try {
      const payload = await post({ unlink_telegram: true });
      apply(payload.data);
    } catch {
      setError(true);
    }
    setTelegramPending(false);
  }

  const personalBlock = (
    <>
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
            <button type="button" className="primary" disabled={emailPending} aria-busy={emailPending} onClick={() => void save()}>
              {emailPending ? t.contactsSaving : t.contactsSave}
            </button>
            {email && !verified ? (
              <button type="button" className="ghost" disabled={emailPending} onClick={() => void resend()}>
                {t.contactsResend}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <TelegramFields
        t={t}
        locked={locked}
        canEdit={canEdit}
        telegram={telegram}
        telegramHandle={telegramHandle}
        telegramUrl={telegramUrl}
        configured={configured}
        wait={waitTelegram}
        pending={telegramPending}
        onUnlink={() => void unlink()}
        onWait={() => setWaitTelegram(true)}
      />
    </>
  );

  return (
    <div className="stack">
      <p className="hint">{t.contactsLead}</p>
      {personalBlock}
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="error">{errorLabel}</p> : null}
      <ContactsWhenList t={t} />
    </div>
  );
}

function TelegramFields({
  t,
  locked,
  canEdit,
  telegram,
  telegramHandle,
  telegramUrl,
  configured,
  wait,
  pending,
  plain = false,
  onUnlink,
  onWait,
}: {
  t: Messages["cabinet"];
  locked: boolean;
  canEdit: boolean;
  telegram: boolean;
  telegramHandle: string | null | undefined;
  telegramUrl: string | null | undefined;
  configured: boolean | null;
  wait: boolean;
  pending: boolean;
  plain?: boolean;
  onUnlink: () => void;
  onWait: () => void;
}) {
  return (
    <div className={plain ? "stack" : "contact-channel"}>
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
      {wait && !telegram ? <p className="hint">{t.contactsTelegramWait}</p> : null}
      {!telegram && configured && !telegramUrl && canEdit && !locked ? <p className="hint">{t.contactsTelegramOff}</p> : null}
      {configured === false ? <p className="hint">{locked ? t.contactsTelegramSoon : t.contactsTelegramOff}</p> : null}
      {telegram && canEdit && !locked ? (
        <div className="wallet-actions">
          <button type="button" className="ghost" disabled={pending} aria-busy={pending} onClick={onUnlink}>
            {t.contactsTelegramUnlink}
          </button>
        </div>
      ) : null}
      {!telegram && telegramUrl && canEdit && !locked ? (
        <div className="wallet-actions">
          <a className="ghost" href={telegramUrl} target="_blank" rel="noreferrer" onClick={onWait}>
            {t.contactsTelegramOpen}
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function ContactsWhenList({ t }: { t: Messages["cabinet"] }) {
  return (
    <div className="contact-when">
      <p className="feed-label">{t.contactsWhen}</p>
      <ul>
        <li>{t.contactsWhenHook}</li>
        <li>{t.contactsWhenBargain}</li>
        <li>{t.contactsWhenNoFee}</li>
        <li>{t.contactsWhenSubmit}</li>
        <li>{t.contactsWhenTx}</li>
        <li>{t.contactsWhenCourt}</li>
      </ul>
    </div>
  );
}

function displayTelegramName(raw: string) {
  const name = raw.trim();
  if (!name) return "";
  if (name.includes(" ")) return name;
  return name.startsWith("@") ? name : `@${name}`;
}
