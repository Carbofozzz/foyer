"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { formatWhen } from "@/lib/i18n/when";
import { formatGen, shortGen } from "@/lib/gen/amount";
import type { AdminOverview } from "@/lib/protocol/admin";

type AdminTab = "platform" | "billing" | "houses" | "users" | "waitlist" | "contacts";

const TABS: AdminTab[] = ["platform", "billing", "houses", "users", "waitlist", "contacts"];

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
  const [tab, setTab] = useState<AdminTab>("platform");
  const [overview, setOverview] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherCredits, setVoucherCredits] = useState("5");
  const [voucherKind, setVoucherKind] = useState<"credits" | "subscription">("credits");
  const [voucherAudience, setVoucherAudience] = useState<"open" | "bound">("open");
  const [voucherEmail, setVoucherEmail] = useState("");
  const [voucherMax, setVoucherMax] = useState("1");
  const [voucherDays, setVoucherDays] = useState("30");
  const [grantHouse, setGrantHouse] = useState("");
  const [grantCredits, setGrantCredits] = useState("5");
  const [floorGen, setFloorGen] = useState(initial.platform?.floor_gen ?? "0.3");
  const [alertGen, setAlertGen] = useState(initial.platform?.alert_gen ?? "1");

  function setVoucherKindAndFields(next: "credits" | "subscription") {
    setVoucherKind(next);
    if (next === "credits") {
      setVoucherCredits("5");
      setVoucherDays("30");
    } else {
      setVoucherCredits("0");
      setVoucherDays("30");
    }
  }

  const tabLabel: Record<AdminTab, string> = {
    platform: a.tabPlatform,
    billing: a.tabBilling,
    houses: `${a.tabHouses} ${overview.totals.live}`,
    users: `${a.tabUsers} ${overview.totals.users}`,
    waitlist: `${a.tabWaitlist} ${overview.totals.waitlist}`,
    contacts: `${a.tabContacts} ${overview.totals.contacts}`,
  };

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
      if (payload.data.platform) {
        setFloorGen(payload.data.platform.floor_gen);
        setAlertGen(payload.data.platform.alert_gen);
      }
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
    <div className="admin-desk">
      {error ? <p className="hint">{error}</p> : null}

      <div className="segmented admin-tabs" role="tablist" aria-label={a.tabs}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`admin-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`admin-pane-${id}`}
            className={tab === id ? "segment is-active" : "segment"}
            onClick={() => setTab(id)}
          >
            {tabLabel[id]}
          </button>
        ))}
      </div>

      {tab === "platform" ? (
        <div className="admin-pane stack" role="tabpanel" id="admin-pane-platform" aria-labelledby="admin-tab-platform">
          <h2 className="section-title">{a.platform}</h2>
          <p className="hint">{a.platformLead}</p>
          {!overview.platform?.configured ? (
            <p className="hint">{a.platformMissing}</p>
          ) : (
            <>
              {(() => {
                const p = overview.platform;
                const status = p.below_floor
                  ? a.platformBelowFloor
                  : p.below_alert
                    ? a.platformBelowAlert
                    : a.platformOk;
                return (
                  <>
                    <p className="wallet-balance" title={p.balance ?? undefined}>
                      {shortGen(p.balance ?? "0")} <span>GEN</span>
                    </p>
                    <p className="muted">{status}</p>
                    <p className="muted">
                      <code>{p.address}</code>
                    </p>
                    {p.studio_faucet ? (
                      <button
                        type="button"
                        className="primary"
                        disabled={pending !== null}
                        aria-busy={pending === "platform_faucet"}
                        onClick={() => void post({ op: "platform_faucet" }, "platform_faucet")}
                      >
                        {pending === "platform_faucet" ? a.platformFaucetBusy : a.platformFaucet}
                      </button>
                    ) : (
                      <p className="hint">{a.platformFaucetOff}</p>
                    )}
                    {p.low_alert_at ? (
                      <p className="hint">
                        {a.platformLastAlert.replace("{at}", formatWhen(p.low_alert_at, locale))}
                        {p.alert_latched ? ` · ${a.platformLatched}` : ""}
                      </p>
                    ) : null}
                  </>
                );
              })()}

              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post(
                    { op: "platform_thresholds", floor_gen: floorGen, alert_gen: alertGen },
                    "platform_thresholds",
                  );
                }}
              >
                <p className="feed-label">{a.platformThresholdsTitle}</p>
                <p className="hint">{a.platformThresholdsLead}</p>
                <label className="stack">
                  <span className="feed-label">{a.platformFloor}</span>
                  <input
                    value={floorGen}
                    onChange={(e) => setFloorGen(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="stack">
                  <span className="feed-label">{a.platformAlert}</span>
                  <input
                    value={alertGen}
                    onChange={(e) => setAlertGen(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="primary"
                  disabled={pending !== null}
                  aria-busy={pending === "platform_thresholds"}
                >
                  {a.platformSaveThresholds}
                </button>
                {overview.platform.thresholds_from_ops ? (
                  <p className="hint">{a.platformThresholdsSaved}</p>
                ) : (
                  <p className="hint">{a.platformThresholdsEnv}</p>
                )}
              </form>

              {(() => {
                const p = overview.platform;
                return (
                  <>
                    <p className="feed-label">{a.platformGas}</p>
                    <p className="hint">
                      {a.platformGasSummary
                        .replace("{count}", String(p.gas.count))
                        .replace("{sum}", shortGen(formatGen(BigInt(p.gas.sum_estimated_wei || "0"))))
                        .replace(
                          "{p50}",
                          p.gas.p50_estimated_wei
                            ? shortGen(formatGen(BigInt(p.gas.p50_estimated_wei)))
                            : "—",
                        )
                        .replace(
                          "{p95}",
                          p.gas.p95_estimated_wei
                            ? shortGen(formatGen(BigInt(p.gas.p95_estimated_wei)))
                            : "—",
                        )}
                    </p>
                    {p.gas.rows.length === 0 ? (
                      <p className="empty">{a.platformGasEmpty}</p>
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>{a.colKind}</th>
                              <th>{a.platformGasEst}</th>
                              <th>{a.colAt}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.gas.rows.slice(0, 12).map((row) => (
                              <tr key={row.id}>
                                <td>{row.kind}</td>
                                <td title={row.estimated_wei}>
                                  {shortGen(formatGen(BigInt(row.estimated_wei || "0")))} GEN
                                </td>
                                <td>
                                  <time dateTime={row.created_at}>{formatWhen(row.created_at, locale)}</time>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="admin-pane stack" role="tabpanel" id="admin-pane-billing" aria-labelledby="admin-tab-billing">
          <h2 className="section-title">{a.billing}</h2>
          <p className="hint">{a.billingLead}</p>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const credits = Number(voucherCredits);
              const max = Number(voucherMax);
              const days = Number(voucherDays);
              if (voucherAudience === "bound" && !voucherEmail.trim()) {
                setError(a.voucherEmailRequired);
                return;
              }
              void post(
                {
                  op: "create_voucher",
                  code: voucherCode,
                  kind: voucherKind,
                  credits: voucherKind === "credits" ? credits : credits > 0 ? credits : 0,
                  max_redemptions: Number.isFinite(max) && max >= 1 ? max : 1,
                  bound_email: voucherAudience === "bound" ? voucherEmail.trim() : null,
                  duration_sec:
                    voucherKind === "subscription" && Number.isFinite(days) && days > 0
                      ? Math.round(days * 24 * 60 * 60)
                      : null,
                },
                "create_voucher",
              ).then(() => {
                setVoucherCode("");
                if (voucherAudience === "bound") setVoucherEmail("");
              });
            }}
          >
            <label className="stack">
              <span className="feed-label">{a.voucherKind}</span>
              <select
                value={voucherKind}
                onChange={(e) =>
                  setVoucherKindAndFields(e.target.value === "subscription" ? "subscription" : "credits")
                }
              >
                <option value="credits">{a.voucherKindCredits}</option>
                <option value="subscription">{a.voucherKindSub}</option>
              </select>
            </label>
            <p className="hint">{voucherKind === "credits" ? a.voucherKindCreditsHint : a.voucherKindSubHint}</p>
            <label className="stack">
              <span className="feed-label">{a.voucherCode}</span>
              <input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} required />
            </label>
            {voucherKind === "credits" ? (
              <label className="stack">
                <span className="feed-label">{a.voucherCreditsPack}</span>
                <input
                  type="number"
                  min={1}
                  value={voucherCredits}
                  onChange={(e) => setVoucherCredits(e.target.value)}
                  required
                />
              </label>
            ) : (
              <>
                <label className="stack">
                  <span className="feed-label">{a.voucherDurationDays}</span>
                  <input
                    type="number"
                    min={1}
                    value={voucherDays}
                    onChange={(e) => setVoucherDays(e.target.value)}
                    required
                  />
                </label>
                <label className="stack">
                  <span className="feed-label">{a.voucherCreditsBonus}</span>
                  <input
                    type="number"
                    min={0}
                    value={voucherCredits}
                    onChange={(e) => setVoucherCredits(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="stack">
              <span className="feed-label">{a.voucherAudience}</span>
              <select
                value={voucherAudience}
                onChange={(e) => setVoucherAudience(e.target.value === "bound" ? "bound" : "open")}
              >
                <option value="open">{a.voucherAudienceOpen}</option>
                <option value="bound">{a.voucherAudienceBound}</option>
              </select>
            </label>
            {voucherAudience === "bound" ? (
              <label className="stack">
                <span className="feed-label">{a.voucherBoundEmail}</span>
                <input
                  type="email"
                  value={voucherEmail}
                  onChange={(e) => setVoucherEmail(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
            ) : (
              <p className="hint">{a.voucherAudienceOpenHint}</p>
            )}
            <label className="stack">
              <span className="feed-label">{a.voucherMaxRedemptions}</span>
              <input
                type="number"
                min={1}
                value={voucherMax}
                onChange={(e) => setVoucherMax(e.target.value)}
                required
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
                    <th>{a.colKind}</th>
                    <th>{a.voucherCreditsShort}</th>
                    <th>{a.voucherBoundShort}</th>
                    <th>{a.colRedeemed}</th>
                    <th>{a.colAt}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overview.vouchers.map((row) => {
                    const key = `voucher:${row.id}`;
                    const kindLabel =
                      row.kind === "subscription"
                        ? a.voucherKindSub
                        : row.kind === "credits"
                          ? a.voucherKindCredits
                          : row.kind;
                    const days =
                      row.duration_sec && row.duration_sec > 0
                        ? Math.round(row.duration_sec / 86_400)
                        : null;
                    return (
                      <tr key={row.id}>
                        <td className="mono">{row.code}</td>
                        <td>
                          {kindLabel}
                          {row.kind === "subscription" && days != null ? ` · ${days}d` : ""}
                        </td>
                        <td className="tabular">{row.credits}</td>
                        <td className="mono muted">{row.bound_email ?? a.voucherAudienceOpen}</td>
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
        </div>
      ) : null}

      {tab === "houses" ? (
        <div className="admin-pane stack" role="tabpanel" id="admin-pane-houses" aria-labelledby="admin-tab-houses">
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
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="admin-pane stack" role="tabpanel" id="admin-pane-users" aria-labelledby="admin-tab-users">
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
        </div>
      ) : null}

      {tab === "waitlist" ? (
        <div className="admin-pane stack" role="tabpanel" id="admin-pane-waitlist" aria-labelledby="admin-tab-waitlist">
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
        </div>
      ) : null}

      {tab === "contacts" ? (
        <div className="admin-pane stack" role="tabpanel" id="admin-pane-contacts" aria-labelledby="admin-tab-contacts">
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
        </div>
      ) : null}
    </div>
  );
}
