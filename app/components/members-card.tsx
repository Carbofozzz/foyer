"use client";

import { useCallback, useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { CabinetGrant, MemberRole } from "@/lib/protocol/types";
import type { Messages } from "@/lib/i18n/load";

type Member = { user_id: string | null; email: string; role: MemberRole; grants: CabinetGrant[]; pending: boolean };

const GRANT_OPTIONS: CabinetGrant[] = ["agents", "treasury", "rules"];

export function MembersCard({
  token,
  houseId,
  selfEmail,
  canInvite,
  asPanel = false,
  t,
  errorLabel,
}: {
  token: string;
  houseId: string;
  selfEmail: string | null;
  canInvite: boolean;
  asPanel?: boolean;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [items, setItems] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<CabinetGrant[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/cabinet/${token}/members`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: { items: Member[] } }>;
      })
      .then((payload) => {
        setItems(payload.data.items);
        setError(false);
      })
      .catch(() => setError(true));
  }, [token, houseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await fetch(`/api/cabinet/${token}/members`, {
      method: "POST",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ email, grants }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: { items: Member[] } };
    setItems(payload.data.items);
    setEmail("");
    setError(false);
  }

  async function saveGrants(target: string, next: CabinetGrant[]) {
    const response = await fetch(`/api/cabinet/${token}/members`, {
      method: "PATCH",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ email: target, grants: next }),
    });
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: { items: Member[] } };
    setItems(payload.data.items);
  }

  async function remove(target: string) {
    const response = await fetch(`/api/cabinet/${token}/members?email=${encodeURIComponent(target)}`, {
      method: "DELETE",
      headers: cabinetHeaders(houseId),
    });
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: { items: Member[] } };
    setItems(payload.data.items);
  }

  const body = (
    <>
      <p className="hint">{t.membersLead}</p>
      {items ? (
        <ul className="member-list">
          {items.map((item) => (
            <li key={item.email}>
              <span className="mono">{item.email}</span>
              <span className="muted">
                {item.role === "owner" ? t.memberOwner : grantSummary(item.grants, t)}
                {item.pending ? ` · ${t.memberPending}` : ""}
                {selfEmail && item.email === selfEmail.toLowerCase() ? ` · ${t.memberYou}` : ""}
              </span>
              {canInvite && item.role !== "owner" ? (
                <>
                  <GrantChecks
                    t={t}
                    value={item.grants}
                    onChange={(next) => void saveGrants(item.email, next)}
                  />
                  <button type="button" className="ghost" onClick={() => remove(item.email)}>
                    {t.remove}
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : error ? (
        <p className="error">{errorLabel}</p>
      ) : (
        <p className="muted">{t.treasuryLoading}</p>
      )}
      {canInvite ? (
        <form className="stack" onSubmit={invite}>
          <label>
            {t.inviteAddress}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t.inviteEmailPlaceholder}
            />
          </label>
          <GrantChecks t={t} value={grants} onChange={setGrants} />
          <p className="hint">{t.membersGrantsHint}</p>
          <button type="submit" className="primary" disabled={pending || !email.trim()} aria-busy={pending}>
            {pending ? t.inviting : t.invite}
          </button>
        </form>
      ) : null}
      {error && items ? <p className="error">{errorLabel}</p> : null}
    </>
  );

  if (asPanel) return <div className="stack">{body}</div>;
  return (
    <details className="members-card">
      <summary>{t.members}</summary>
      {body}
    </details>
  );
}

function GrantChecks({
  t,
  value,
  onChange,
}: {
  t: Messages["cabinet"];
  value: CabinetGrant[];
  onChange: (next: CabinetGrant[]) => void;
}) {
  return (
    <div className="check-list">
      {GRANT_OPTIONS.map((grant) => (
        <label key={grant} className="check-row">
          <input
            type="checkbox"
            checked={value.includes(grant)}
            onChange={(event) => {
              const next = event.target.checked ? [...value, grant] : value.filter((item) => item !== grant);
              onChange(next);
            }}
          />
          {grantLabel(grant, t)}
        </label>
      ))}
    </div>
  );
}

function grantLabel(grant: CabinetGrant, t: Messages["cabinet"]) {
  if (grant === "treasury") return t.grantTreasury;
  if (grant === "rules") return t.grantRules;
  return t.grantAgents;
}

function grantSummary(grants: CabinetGrant[], t: Messages["cabinet"]) {
  if (grants.length === 0) return t.grantRead;
  return grants.map((grant) => grantLabel(grant, t)).join(" · ");
}
