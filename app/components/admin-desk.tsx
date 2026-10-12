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
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherCredits, setVoucherCredits] = useState("5");
  const [voucherKind, setVoucherKind] = useState<"credits" | "subscription">("credits");
  const [grantHouse, setGrantHouse] = useState("");
  const [grantCredits, setGrantCredits] = useState("5");
  const { totals } = overview;

  async function post(op: Record<string, unknown>, key: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
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

  async function run(op: Record<string, string>, confirmText: string, key: string) {
    await post(op, key, confirmText);
  }

  return (
    <>
      <p className="muted admin-totals">
        {a.totals
          .replace("{waitlist}", String(totals.waitlist))
          .replace("{users}", String(totals.users))
          .replace("{houses}", String(totals.live))
          .replace("{agents}", String(totals.agents))
          .replace("{hooks}", String(totals.hooks))
          .replace("{escalated}", String(totals.escalated))}
      </p>
      {error ? <p className="hint">{error}</p> : null}

      <h2 className="section-title">{a.billing}</h2>
      <p className="hint">{a.billingLead}</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const credits = Number(voucherCredits);
          void post(
            {
              op: "create_voucher",
              code: voucherCode,
              kind: voucherKind,
              credits: voucherKind === "credits" ? credits : credits > 0 ? credits : undefined,
              max_redemptions: 1,
              duration_sec: voucherKind === "subscription" ? 30 * 24 * 60 * 60 : undefined,
            },
            "create_voucher",
          ).then(() => setVoucherCode(""));
        }}
      >
        <label className="stack">
          <span className="feed-label">{a.voucherKind}</span>
          <select
            value={voucherKind}
            onChange={(e) => setVoucherKind(e.target.value === "subscription" ? "subscription" : "credits")}
          >
            <option value="credits">{a.voucherKindCredits}</option>
            <option value="subscription">{a.voucherKindSub}</option>
          </select>
        </label>
        <label className="stack">
          <span className="feed-label">{a.voucherCode}</span>
          <input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} required />
        </label>
        <label className="stack">
          <span className="feed-label">{a.voucherCredits}</span>
          <input
            type="number"
            min={voucherKind === "subscription" ? 0 : 1}
            value={voucherCredits}
            onChange={(e) => setVoucherCredits(e.target.value)}
            required={voucherKind === "credits"}
          />
        </label>
        <button type="submit" className="primary" disabled={pending !== null} aria-busy={pending === "create_voucher"}>
          {a.createVoucher}
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void post(
            { op: "grant_credits", house_id: grantHouse, credits: Number(grantCredits) },
            "grant_credits",
          );
        }}
      >
        <label className="stack">
          <span className="feed-label">{a.grantHouse}</span>
          <input value={grantHouse} onChange={(e) => setGrantHouse(e.target.value)} required className="mono" />
        </label>
        <label className="stack">
          <span className="feed-label">{a.grantCredits}</span>
          <input
            type="number"
            min={1}
            value={grantCredits}
            onChange={(e) => setGrantCredits(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="ghost" disabled={pending !== null} aria-busy={pending === "grant_credits"}>
          {a.grantCreditsBtn}
        </button>
      </form>
      {overview.vouchers.length === 0 ? (
        <p className="empty">{a.vouchersEmpty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{a.voucherCode}</th>
                <th>{a.voucherCredits}</th>
                <th>{a.colRedeemed}</th>
                <th>{a.colAt}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overview.vouchers.map((row) => {
                const key = `voucher:${row.id}`;
                return (
                  <tr key={row.id}>
                    <td className="mono">{row.code}</td>
                    <td className="tabular">{row.credits}</td>
                    <td className="tabular">
                      {row.redeemed_count}/{row.max_redemptions}
                    </td>
                    <td className="muted">{formatWhen(row.created_at, locale)}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        disabled={pending !== null}
                        aria-busy={pending === key}
                        onClick={() => void run({ op: "revoke_voucher", code: row.code }, a.confirmRevoke, key)}
                      >
                        {a.revokeVoucher}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
                  <td className="mono muted">{row.owner ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">{a.users}</h2>
      {overview.users.length === 0 ? (
        <p className="empty">{a.usersEmpty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{a.colEmail}</th>
                <th>{a.colVerified}</th>
                <th>{a.colRole}</th>
                <th>{a.colHouses}</th>
                <th>{a.colAt}</th>
                <th>{a.colSeen}</th>
              </tr>
            </thead>
            <tbody>
              {overview.users.map((row) => (
                <tr key={row.id}>
                  <td className="mono">{row.email}</td>
                  <td>{row.verified ? a.yes : a.no}</td>
                  <td>{row.role}</td>
                  <td className="tabular">{row.houses}</td>
                  <td className="muted">{formatWhen(row.created_at, locale)}</td>
                  <td className="muted">{row.last_seen_at ? formatWhen(row.last_seen_at, locale) : "—"}</td>
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
                const label = row.owner ?? row.id;
                return (
                  <tr key={row.id}>
                    <td className="mono" title={row.owner ?? row.id}>
                      {row.owner ?? "—"}
                    </td>
                    <td>
                      {row.type === "org"
                        ? row.name.trim()
                          ? `${t.home.typeOrg} · ${row.name.trim()}`
                          : t.home.typeOrg
                        : t.home.typePersonal}
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
