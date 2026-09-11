"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { formatWhen } from "@/lib/i18n/when";
import type { AdminOverview } from "@/lib/protocol/admin";

export function AdminDesk({
  locale,
  t,
  initial,
}: {
  locale: Locale;
  t: Messages;
  initial: AdminOverview;
}) {
  const a = t.admin;
  const [overview, setOverview] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { totals } = overview;

  async function run(op: Record<string, string>, confirmText: string, key: string) {
    if (!window.confirm(confirmText)) return;
    setPending(key);
    setError(null);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(op),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: AdminOverview; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data) {
        setError(payload?.error?.message ?? t.cabinet.error);
        return;
      }
      setOverview(payload.data);
    } catch {
      setError(t.cabinet.error);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <p className="muted admin-totals">
        {a.totals
          .replace("{waitlist}", String(totals.waitlist))
          .replace("{houses}", String(totals.live))
          .replace("{agents}", String(totals.agents))
          .replace("{hooks}", String(totals.hooks))
          .replace("{escalated}", String(totals.escalated))}
      </p>
      {error ? <p className="hint">{error}</p> : null}

      <h2 className="section-title">{a.waitlist}</h2>
      {overview.waitlist.length === 0 ? (
        <p className="empty">{a.waitlistEmpty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{a.colEmail}</th>
                <th>{a.colLocale}</th>
                <th>{a.colAt}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overview.waitlist.map((row) => {
                const key = `mail:${row.email}`;
                return (
                  <tr key={row.email}>
                    <td className="mono">{row.email}</td>
                    <td>{row.locale}</td>
                    <td className="muted">{formatWhen(row.created_at, locale)}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        disabled={pending !== null}
                        aria-busy={pending === key}
                        onClick={() =>
                          void run(
                            { op: "delete_waitlist", email: row.email },
                            a.confirmWaitlist.replace("{email}", row.email),
                            key,
                          )
                        }
                      >
                        {pending === key ? a.deleting : a.remove}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">{a.contacts}</h2>
      {overview.contacts.length === 0 ? (
        <p className="empty">{a.contactsEmpty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{a.colEmail}</th>
                <th>{a.colVerified}</th>
                <th>{a.colOwner}</th>
              </tr>
            </thead>
            <tbody>
              {overview.contacts.map((row) => (
                <tr key={`${row.email}:${row.owner ?? "none"}`}>
                  <td className="mono">{row.email}</td>
                  <td>{row.verified ? a.yes : a.no}</td>
                  <td className="mono muted">{row.owner ? shortAddr(row.owner) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">{a.houses}</h2>
      {overview.houses.length === 0 ? (
        <p className="empty">{a.housesEmpty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{a.colOwner}</th>
                <th>{a.colKind}</th>
                <th>{a.colAt}</th>
                <th>{a.colAgents}</th>
                <th>{a.colHooks}</th>
                <th>{a.colActions}</th>
                <th>{a.colTest}</th>
                <th>{a.colEscalated}</th>
                <th>{a.colMembers}</th>
                <th>{a.colCourt}</th>
                <th>{a.colTelegram}</th>
                <th>{a.colLast}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overview.houses.map((row) => {
                const key = `house:${row.id}`;
                const label = row.owner ? shortAddr(row.owner) : row.id;
                return (
                  <tr key={row.id}>
                    <td className="mono" title={row.owner ?? row.id}>
                      {row.owner ? shortAddr(row.owner) : "—"}
                    </td>
                    <td>
                      {row.spawn ? a.spawn : row.type === "org" ? t.home.typeOrg : t.home.typePersonal}
                      {row.connected ? "" : ` · ${a.notConnected}`}
                    </td>
                    <td className="muted">{formatWhen(row.created_at, locale)}</td>
                    <td className="tabular">{row.agents}</td>
                    <td className="tabular">{row.hooks}</td>
                    <td className="tabular">{row.actions}</td>
                    <td className="tabular">{row.test_actions}</td>
                    <td className="tabular">{row.escalated}</td>
                    <td className="tabular">{row.members}</td>
                    <td>{row.court ? a.yes : a.no}</td>
                    <td>{row.telegram ? row.telegram_handle || a.yes : a.no}</td>
                    <td className="muted">{row.last_action_at ? formatWhen(row.last_action_at, locale) : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        disabled={pending !== null}
                        aria-busy={pending === key}
                        onClick={() =>
                          void run(
                            { op: "delete_house", house_id: row.id },
                            a.confirmHouse.replace("{house}", label),
                            key,
                          )
                        }
                      >
                        {pending === key ? a.deleting : a.remove}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function shortAddr(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
