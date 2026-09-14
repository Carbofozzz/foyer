"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/app/components/status-pill";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { useCabinetTab } from "@/app/lib/use-cabinet-tab";
import type { Messages } from "@/lib/i18n/load";
import { NOTIFY_REASON_KEYS, type NotifyReasonKey } from "@/lib/notify/reasons";

type ContactPolicyKind = "all" | "points" | "objector";

type Desk = { id: string; name: string };

type Policy = {
  kind: ContactPolicyKind;
  reasons: NotifyReasonKey[];
  objector_id: string | null;
};

type Person = {
  id: string;
  label: string;
  email: string | null;
  email_verified: boolean;
  telegram: boolean;
  telegram_handle: string | null;
  telegram_url: string | null;
  policy: Policy | null;
};

type Payload = {
  telegram_configured?: boolean;
  targets?: Person[];
  desks?: Desk[];
};

type Modal = { kind: "channels" | "policy"; id: string };

function pointLabel(t: Messages["cabinet"], key: NotifyReasonKey): string {
  if (key === "hookFailed") return t.contactsWhenHook;
  if (key === "bargainTimeout") return t.contactsWhenBargain;
  if (key === "noFee") return t.contactsWhenNoFee;
  if (key === "submitFail") return t.contactsWhenSubmit;
  if (key === "txError") return t.contactsWhenTx;
  return t.contactsWhenCourt;
}

function reachable(row: Person) {
  return Boolean(row.telegram || (row.email && row.email_verified));
}

function isActive(row: Person) {
  return reachable(row) && Boolean(row.policy);
}

export function OrgContactsCard({
  token,
  houseId,
  locale,
  canEdit,
  locked = false,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  locale: string;
  canEdit: boolean;
  locked?: boolean;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [addLabel, setAddLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [waitIds, setWaitIds] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftKind, setDraftKind] = useState<ContactPolicyKind>("all");
  const [draftReasons, setDraftReasons] = useState<NotifyReasonKey[]>([...NOTIFY_REASON_KEYS]);
  const [draftObjector, setDraftObjector] = useState("");
  const contactsTab = useCabinetTab("contacts");

  function fail(message?: string) {
    setError(message || errorLabel);
  }

  function apply(data: Payload) {
    const next = data.targets ?? [];
    setPeople(next);
    setDesks(data.desks ?? []);
    setConfigured(data.telegram_configured !== false);
    setWaitIds((ids) => ids.filter((id) => !next.some((row) => row.id === id && row.telegram)));
    setError(null);
  }

  async function readJson(response: Response) {
    const payload = (await response.json().catch(() => null)) as
      | { data?: Payload; error?: { code?: string; message?: string } }
      | null;
    if (!response.ok || !payload?.data) {
      const code = payload?.error?.code;
      if (code === "duplicate_email") throw new Error(t.contactsDuplicateEmail);
      if (code === "duplicate_telegram") throw new Error(t.contactsDuplicateTelegram);
      throw new Error(payload?.error?.message || errorLabel);
    }
    return payload.data;
  }

  useEffect(() => {
    if (locked || !contactsTab) return;
    function load(wake: boolean) {
      const q = wake ? "?wake=1" : "";
      fetch(`/api/cabinet/${token}/contacts${q}`, { headers: cabinetHeaders(houseId) })
        .then(readJson)
        .then(apply)
        .catch((err: unknown) => fail(err instanceof Error ? err.message : undefined));
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
  }, [locked, contactsTab, token, houseId]);

  useEffect(() => {
    const waiting = waitIds.length > 0 || (modal?.kind === "channels" && waitIds.includes(modal.id));
    if (locked || !contactsTab || !waiting) return;
    const tick = window.setInterval(() => {
      fetch(`/api/cabinet/${token}/contacts?wake=1`, { headers: cabinetHeaders(houseId) })
        .then(readJson)
        .then(apply)
        .catch((err: unknown) => fail(err instanceof Error ? err.message : undefined));
    }, 4000);
    return () => window.clearInterval(tick);
  }, [locked, contactsTab, waitIds, modal, token, houseId]);

  useEffect(() => {
    if (!modal) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/cabinet/${token}/contacts`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    return readJson(response);
  }

  function openChannels(row: Person) {
    setDraftLabel(row.label);
    setDraftEmail(row.email ?? "");
    setHint(null);
    setError(null);
    setModal({ kind: "channels", id: row.id });
  }

  function openPolicy(row: Person) {
    setDraftKind(row.policy?.kind ?? "all");
    setDraftReasons(row.policy?.reasons?.length ? row.policy.reasons : [...NOTIFY_REASON_KEYS]);
    setDraftObjector(row.policy?.objector_id ?? "");
    setHint(null);
    setError(null);
    setModal({ kind: "policy", id: row.id });
  }

  const openRow = modal ? people.find((row) => row.id === modal.id) : undefined;

  async function addPerson() {
    setPending(true);
    setError(null);
    setHint(null);
    try {
      apply(await post({ add: true, label: addLabel, locale }));
      setAddLabel("");
    } catch (err) {
      fail(err instanceof Error ? err.message : undefined);
    }
    setPending(false);
  }

  async function saveChannels() {
    if (!modal) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      apply(
        await post({
          save_id: modal.id,
          label: draftLabel,
          email: draftEmail,
          locale,
        }),
      );
      if (draftEmail.trim()) setHint(t.contactsSent);
    } catch (err) {
      fail(err instanceof Error ? err.message : undefined);
    }
    setBusy(false);
  }

  async function savePolicy() {
    if (!modal) return;
    setBusy(true);
    setError(null);
    try {
      apply(
        await post({
          save_policy: modal.id,
          kind: draftKind,
          reasons: draftReasons,
          objector_id: draftObjector,
          locale,
        }),
      );
      setModal(null);
    } catch (err) {
      fail(err instanceof Error ? err.message : undefined);
    }
    setBusy(false);
  }

  async function removePerson(id: string) {
    setError(null);
    try {
      apply(await post({ remove_id: id }));
      setModal(null);
    } catch (err) {
      fail(err instanceof Error ? err.message : undefined);
    }
  }

  async function resend(id: string) {
    try {
      await post({ resend_id: id, locale });
      setHint(t.contactsSent);
    } catch (err) {
      fail(err instanceof Error ? err.message : undefined);
    }
  }

  async function unlink(id: string) {
    try {
      apply(await post({ unlink_telegram_id: id }));
    } catch (err) {
      fail(err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div className="stack">
      <p className="hint">{t.contactsOrgLead}</p>
      {people.length === 0 ? <p className="hint">{t.contactsEmptyList}</p> : null}
      {people.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table contact-people">
            <thead>
              <tr>
                <th>{t.contactsPairName}</th>
                <th>{t.contactsColChannels}</th>
                <th>{t.contactsColPolicy}</th>
                <th>{t.contactsColStatus}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((row) => {
                const active = isActive(row);
                return (
                  <tr key={row.id}>
                    <td>{row.label.trim() || t.contactsPairUnnamed}</td>
                    <td>
                      <button type="button" className="ghost contact-cell-link" onClick={() => openChannels(row)}>
                        {channelsShort(t, row)}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="ghost contact-cell-link" onClick={() => openPolicy(row)}>
                        {policyShort(t, row, desks)}
                      </button>
                    </td>
                    <td>
                      <StatusPill tone={active ? "ok" : "warn"}>
                        {active ? t.contactsStatusActive : t.contactsStatusIdle}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {canEdit && !locked ? (
        <div className="contact-add-row">
          <label>
            {t.contactsNewPerson}
            <input
              type="text"
              value={addLabel}
              onChange={(event) => setAddLabel(event.target.value)}
              placeholder={t.contactsPairNameHint}
            />
          </label>
          <button type="button" className="primary" disabled={pending || !addLabel.trim()} aria-busy={pending} onClick={() => void addPerson()}>
            {pending ? t.contactsSaving : t.contactsAddPerson}
          </button>
        </div>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {modal && openRow ? (
        <div className="wizard-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div
            className="wizard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="org-contact-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wizard-head">
              <div>
                <h2 id="org-contact-modal-title" className="section-title">
                  {modal.kind === "channels" ? t.contactsChannelsTitle : t.contactsPolicyTitle}
                </h2>
                <p className="kicker">{openRow.label.trim() || t.contactsPairUnnamed}</p>
              </div>
              <button type="button" className="ghost" onClick={() => setModal(null)}>
                {t.contactsModalClose}
              </button>
            </div>
            {modal.kind === "channels" ? (
              <div className="stack">
                <p className="hint">{t.contactsChannelsLead}</p>
                <label>
                  {t.contactsPairName}
                  <input
                    type="text"
                    value={draftLabel}
                    disabled={locked || !canEdit}
                    onChange={(event) => setDraftLabel(event.target.value)}
                  />
                </label>
                <label>
                  {t.contactsEmail}
                  <input
                    type="email"
                    value={draftEmail}
                    disabled={locked || !canEdit}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>
                {openRow.email ? (
                  <p className="hint">{openRow.email_verified ? t.contactsVerified : t.contactsUnverified}</p>
                ) : null}
                {canEdit && !locked && openRow.email && !openRow.email_verified ? (
                  <div className="wallet-actions">
                    <button type="button" className="ghost" onClick={() => void resend(openRow.id)}>
                      {t.contactsResend}
                    </button>
                  </div>
                ) : null}
                <TelegramBlock
                  t={t}
                  locked={locked}
                  canEdit={canEdit}
                  row={openRow}
                  configured={configured}
                  wait={waitIds.includes(openRow.id) && !openRow.telegram}
                  onUnlink={() => void unlink(openRow.id)}
                  onWait={() => setWaitIds((ids) => (ids.includes(openRow.id) ? ids : [...ids, openRow.id]))}
                />
                {canEdit && !locked ? (
                  <div className="wizard-nav">
                    <button type="button" className="ghost" onClick={() => void removePerson(openRow.id)}>
                      {t.contactsRemove}
                    </button>
                    <button type="button" className="primary" disabled={busy} aria-busy={busy} onClick={() => void saveChannels()}>
                      {busy ? t.contactsSaving : t.contactsSave}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="stack">
                <p className="hint">{t.contactsOrgPoliciesLead}</p>
                <fieldset className="contact-cover">
                  <legend>{t.contactsPolicyKind}</legend>
                  {(["all", "points", "objector"] as const).map((value) => (
                    <label key={value} className="check-row">
                      <input
                        type="radio"
                        name="org-policy-kind"
                        checked={draftKind === value}
                        disabled={locked || !canEdit}
                        onChange={() => setDraftKind(value)}
                      />
                      {value === "all" ? t.contactsPolicyAll : value === "points" ? t.contactsPolicyPoints : t.contactsPolicyObjector}
                    </label>
                  ))}
                </fieldset>
                {draftKind === "all" ? null : (
                  <div className="check-list">
                    <p className="feed-label">{t.contactsPolicyPointsPick}</p>
                    {NOTIFY_REASON_KEYS.map((key) => (
                      <label key={key} className="check-row">
                        <input
                          type="checkbox"
                          checked={draftReasons.includes(key)}
                          disabled={locked || !canEdit}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...draftReasons, key]
                              : draftReasons.filter((item) => item !== key);
                            setDraftReasons(next);
                          }}
                        />
                        {pointLabel(t, key)}
                      </label>
                    ))}
                  </div>
                )}
                {draftKind === "objector" ? (
                  <label>
                    {t.contactsPolicyObjectorWho}
                    <select
                      value={draftObjector}
                      disabled={locked || !canEdit}
                      onChange={(event) => setDraftObjector(event.target.value)}
                    >
                      <option value="">{t.contactsPolicyObjectorPick}</option>
                      {desks.map((desk) => (
                        <option key={desk.id} value={desk.id}>
                          {desk.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {canEdit && !locked ? (
                  <div className="wizard-nav">
                    <span />
                    <button type="button" className="primary" disabled={busy} aria-busy={busy} onClick={() => void savePolicy()}>
                      {busy ? t.contactsSaving : t.contactsPolicySave}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            {hint ? <p className="hint">{hint}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function channelsShort(t: Messages["cabinet"], row: Person) {
  const bits: string[] = [];
  if (row.email) bits.push(t.contactsEmail);
  if (row.telegram) bits.push(t.contactsTelegram);
  return bits.length ? bits.join(" · ") : t.contactsChannelsAdd;
}

function policyShort(t: Messages["cabinet"], row: Person, desks: Desk[]) {
  const policy = row.policy;
  if (!policy) return t.contactsPolicyAdd;
  if (policy.kind === "all") return t.contactsPolicyAll;
  if (policy.kind === "points") return t.contactsPolicyPoints;
  const who = desks.find((desk) => desk.id === policy.objector_id)?.name;
  return who ? `${t.contactsPolicyObjectorShort}: ${who}` : t.contactsPolicyObjector;
}

function TelegramBlock({
  t,
  locked,
  canEdit,
  row,
  configured,
  wait,
  onUnlink,
  onWait,
}: {
  t: Messages["cabinet"];
  locked: boolean;
  canEdit: boolean;
  row: Person;
  configured: boolean | null;
  wait: boolean;
  onUnlink: () => void;
  onWait: () => void;
}) {
  const name = displayTelegramName(row.telegram_handle ?? "");
  return (
    <div className="stack">
      <label>
        {t.contactsTelegram}
        <input type="text" value={row.telegram ? name : ""} readOnly disabled={locked || !canEdit} autoComplete="off" />
      </label>
      {row.telegram ? <p className="hint">{t.contactsTelegramLinked}</p> : null}
      {wait && !row.telegram ? <p className="hint">{t.contactsTelegramWait}</p> : null}
      {configured === false ? <p className="hint">{locked ? t.contactsTelegramSoon : t.contactsTelegramOff}</p> : null}
      {row.telegram && canEdit && !locked ? (
        <div className="wallet-actions">
          <button type="button" className="ghost" onClick={onUnlink}>
            {t.contactsTelegramUnlink}
          </button>
        </div>
      ) : null}
      {!row.telegram && row.telegram_url && canEdit && !locked ? (
        <div className="wallet-actions">
          <a className="ghost" href={row.telegram_url} target="_blank" rel="noreferrer" onClick={onWait}>
            {t.contactsTelegramOpen}
          </a>
        </div>
      ) : null}
    </div>
  );
}

function displayTelegramName(raw: string) {
  const name = raw.trim();
  if (!name) return "";
  if (name.includes(" ")) return name;
  return name.startsWith("@") ? name : `@${name}`;
}
