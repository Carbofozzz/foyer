"use client";

import { useCallback, useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { roleLabel } from "@/app/components/house-switch";
import type { MemberRole } from "@/lib/protocol/types";
import type { Messages } from "@/lib/i18n/load";

type Member = { address: string; role: MemberRole };

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
  const [role, setRole] = useState<"operator" | "observer">("operator");
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
      body: JSON.stringify({ address, role }),
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
                {roleLabel(item.role, t)}
                {selfAddress && item.address.toLowerCase() === selfAddress.toLowerCase() ? ` · ${t.memberYou}` : ""}
              </span>
              {canInvite && item.role !== "owner" ? (
                <button type="button" className="ghost" onClick={() => remove(item.address)}>
                  {t.remove}
                </button>
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
          <label>
            {t.inviteRole}
            <select value={role} onChange={(event) => setRole(event.target.value as "operator" | "observer")}>
              <option value="operator">{t.memberOperator}</option>
              <option value="observer">{t.memberObserver}</option>
            </select>
          </label>
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

function short(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
