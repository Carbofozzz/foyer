"use client";

import { useCallback, useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { CabinetGrant, MemberRole } from "@/lib/protocol/types";
import type { Messages } from "@/lib/i18n/load";

type Member = { address: string; role: MemberRole; grants: CabinetGrant[] };

const GRANT_OPTIONS: CabinetGrant[] = ["agents", "treasury", "rules"];

export function MembersCard({
  token,
  houseId,
  selfAddress,
  canInvite,
  asPanel = false,
  t,
  errorLabel,
}: {
  token: string;
  houseId: string;
  selfAddress: string | null;
  canInvite: boolean;
  asPanel?: boolean;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [items, setItems] = useState<Member[] | null>(null);
  const [address, setAddress] = useState("");
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
      body: JSON.stringify({ address, grants }),
    });
    setPending(false);
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: { items: Member[] } };
    setItems(payload.data.items);
    setAddress("");
    setError(false);
  }

  async function saveGrants(target: string, next: CabinetGrant[]) {
    const response = await fetch(`/api/cabinet/${token}/members`, {
      method: "PATCH",
      headers: cabinetHeaders(houseId, { "content-type": "application/json" }),
      body: JSON.stringify({ address: target, grants: next }),
    });
    if (!response.ok) {
      setError(true);
      return;
    }
    const payload = (await response.json()) as { data: { items: Member[] } };
    setItems(payload.data.items);
  }

  async function remove(target: string) {
    const response = await fetch(`/api/cabinet/${token}/members?address=${encodeURIComponent(target)}`, {
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
            <li key={item.address}>
              <span className="mono">{short(item.address)}</span>
              <span className="muted">
                {item.role === "owner" ? t.memberOwner : grantSummary(item.grants, t)}
                {selfAddress && item.address.toLowerCase() === selfAddress.toLowerCase() ? ` · ${t.memberYou}` : ""}
              </span>
              {canInvite && item.role !== "owner" ? (
                <>
                  <GrantChecks
                    t={t}
                    value={item.grants}
                    onChange={(next) => void saveGrants(item.address, next)}
                  />
                  <button type="button" className="ghost" onClick={() => remove(item.address)}>
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
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" />
          </label>
          <GrantChecks t={t} value={grants} onChange={setGrants} />
          <p className="hint">{t.membersGrantsHint}</p>
          <button type="submit" className="primary" disabled={pending || !address.trim()} aria-busy={pending}>
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

function short(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
