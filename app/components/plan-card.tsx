"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/load";
import { formatWhen } from "@/lib/i18n/when";
import { HOUSE_EVENT } from "@/lib/wallet/events";

type CryptoOffer = {
  plan_id: string;
  code: string;
  kind: string;
  label: string;
  credits: number;
  amount_wei: string;
  amount_gen: string;
  feature_org: boolean;
};

type Checkout = {
  checkout_id: string;
  pay_to: string;
  amount_wei: string;
  amount_gen: string;
  plan_code: string;
  label: string;
  expires_at: string;
};

type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  provider: string;
  note: string | null;
  case_id: string | null;
  created_at: string;
};

type PlanView = {
  credits: number;
  free_remaining: number;
  free_quota: number;
  free_used: number;
  free_period_end: string | null;
  subscription_credits: number;
  on_demand: number;
  feature_org: boolean;
  in_grace: boolean;
  subscription_plan_id: string | null;
  subscription_period_end: string | null;
  subscription_grace_until: string | null;
  org_frozen_at: string | null;
  gate: boolean;
  plan?: {
    code: string;
    label: string;
    kind: string;
    status: "free" | "active" | "grace" | "frozen";
    period_end: string | null;
    grace_until: string | null;
  };
  ledger?: LedgerRow[];
  crypto?: {
    enabled: boolean;
    pay_to: string | null;
    offers: CryptoOffer[];
  };
};

function reasonLabel(reason: string, t: Messages["cabinet"]): string {
  switch (reason) {
    case "grant_voucher":
      return t.planReasonVoucher;
    case "grant_admin":
      return t.planReasonAdmin;
    case "grant_sub":
      return t.planReasonSub;
    case "grant_crypto":
      return t.planReasonCrypto;
    case "debit_court":
      return t.planReasonCourt;
    case "burn_sub":
      return t.planReasonBurn;
    case "adjust":
      return t.planReasonAdjust;
    default:
      return reason;
  }
}

function statusLabel(status: NonNullable<PlanView["plan"]>["status"], t: Messages["cabinet"]): string {
  switch (status) {
    case "active":
      return t.planStatusActive;
    case "grace":
      return t.planStatusGrace;
    case "frozen":
      return t.planStatusFrozen;
    default:
      return t.planStatusFree;
  }
}

export function PlanCard({
  token,
  houseId,
  locale,
  locked = false,
  preview = null,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  locale: Locale | string;
  locked?: boolean;
  preview?: PlanView | null;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [data, setData] = useState<PlanView | null>(preview);
  const [code, setCode] = useState("");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [tx, setTx] = useState("");
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/cabinet/${token}/plan`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: PlanView }>;
      })
      .then((payload) => {
        setData(payload.data);
        setLoadError(null);
      })
      .catch(() => setLoadError(errorLabel));
  }, [token, houseId, errorLabel]);

  useEffect(() => {
    if (preview) return;
    load();
    function onTab() {
      const radio = document.getElementById("cabinet-tab-plan");
      if (radio instanceof HTMLInputElement && radio.checked) load();
    }
    window.addEventListener(HOUSE_EVENT, load);
    document.querySelectorAll("input.cabinet-tab-radio").forEach((node) => {
      node.addEventListener("change", onTab);
    });
    return () => {
      window.removeEventListener(HOUSE_EVENT, load);
      document.querySelectorAll("input.cabinet-tab-radio").forEach((node) => {
        node.removeEventListener("change", onTab);
      });
    };
  }, [preview, load]);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    if (locked || pending || !code.trim()) return;
    setPending(true);
    setCodeError(null);
    setFlash(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json", ...cabinetHeaders(houseId) },
        body: JSON.stringify({ op: "redeem", code }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: PlanView & { redeemed?: { credits_granted: number } }; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data) {
        setCodeError(payload?.error?.message ?? errorLabel);
        return;
      }
      setData(payload.data);
      setCode("");
      const granted = payload.data.redeemed?.credits_granted ?? 0;
      setFlash(t.planRedeemed.replace("{n}", String(granted)));
    } catch {
      setCodeError(errorLabel);
    } finally {
      setPending(false);
    }
  }

  async function startCheckout(planCode: string) {
    if (locked || pending) return;
    setPending(true);
    setTopUpError(null);
    setFlash(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json", ...cabinetHeaders(houseId) },
        body: JSON.stringify({ op: "crypto_checkout", plan_code: planCode }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: PlanView & { checkout?: Checkout }; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data?.checkout) {
        setTopUpError(payload?.error?.message ?? errorLabel);
        return;
      }
      setData(payload.data);
      setCheckout(payload.data.checkout);
      setTx("");
    } catch {
      setTopUpError(errorLabel);
    } finally {
      setPending(false);
    }
  }

  async function confirmPay(event: React.FormEvent) {
    event.preventDefault();
    if (locked || pending || !checkout || !tx.trim()) return;
    setPending(true);
    setTopUpError(null);
    setFlash(null);
    try {
      const response = await fetch(`/api/cabinet/${token}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json", ...cabinetHeaders(houseId) },
        body: JSON.stringify({
          op: "crypto_confirm",
          checkout_id: checkout.checkout_id,
          tx: tx.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: PlanView & { paid?: { credits_granted: number } }; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data) {
        setTopUpError(payload?.error?.message ?? errorLabel);
        return;
      }
      setData(payload.data);
      setCheckout(null);
      setTx("");
      const granted = payload.data.paid?.credits_granted ?? 0;
      setFlash(t.planRedeemed.replace("{n}", String(granted)));
    } catch {
      setTopUpError(errorLabel);
    } finally {
      setPending(false);
    }
  }

  async function copyPayTo() {
    if (!checkout?.pay_to) return;
    try {
      await navigator.clipboard.writeText(checkout.pay_to);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!data) {
    return loadError ? <p className="error">{loadError}</p> : <p className="muted">{t.planLoading}</p>;
  }

  const plan = data.plan ?? {
    code: "free",
    label: "Free",
    kind: "free",
    status: "free" as const,
    period_end: null,
    grace_until: null,
  };
  const ledger = data.ledger ?? [];
  const cryptoOn = Boolean(data.crypto?.enabled && data.crypto.offers.length > 0);
  const featured = plan.status === "active" || plan.status === "grace";

  return (
    <div className="plan-desk">
      {loadError ? <p className="error">{loadError}</p> : null}
      <div className="plan-grid">
        <section className={`card pricing-card plan-block${featured ? " is-featured" : ""}`}>
          <p className="feed-label">{t.planSectionTariff}</p>
          <p className="pricing-price">{plan.label}</p>
          <p className="plan-status">{statusLabel(plan.status, t)}</p>
          {plan.period_end && (plan.status === "active" || plan.status === "grace") ? (
            <p className="muted">
              {t.planPeriodEnd.replace("{when}", formatWhen(plan.period_end, locale))}
            </p>
          ) : null}
          {plan.status === "grace" && plan.grace_until ? (
            <p className="hint">{t.planGraceUntil.replace("{when}", formatWhen(plan.grace_until, locale))}</p>
          ) : null}
          {plan.status === "frozen" ? <p className="hint">{t.planOrgFrozen}</p> : null}
          <ul className="pricing-checks">
            <li>
              <span className={data.feature_org ? "pricing-yes" : "pricing-no"} aria-hidden="true">
                {data.feature_org ? "✓" : "—"}
              </span>
              {data.feature_org ? t.planOrgOn : t.planOrgOff}
            </li>
            {!data.gate ? (
              <li>
                <span className="pricing-no" aria-hidden="true">
                  —
                </span>
                {t.planGateOff}
              </li>
            ) : null}
          </ul>
          <p className="pricing-blurb">{t.planHint}</p>
        </section>

        <section className="card pricing-card plan-block">
          <p className="feed-label">{t.planSectionBalance}</p>
          <h2 className="pricing-name">{t.planCreditsAvailable}</h2>
          <p className="pricing-price" title={String(data.credits)}>
            {data.credits}
            <span className="pricing-unit">{t.planCreditsUnit}</span>
          </p>
          <ul className="pricing-checks plan-balance-lines">
            {data.free_quota > 0 ? (
              <li>
                <span className="plan-balance-key">{t.planPoolFree}</span>
                <span className="plan-balance-val">
                  {data.free_remaining}
                  <span className="muted"> / {data.free_quota}</span>
                </span>
              </li>
            ) : null}
            <li>
              <span className="plan-balance-key">{t.planPoolSub}</span>
              <span className="plan-balance-val">{data.subscription_credits}</span>
            </li>
            <li>
              <span className="plan-balance-key">{t.planPoolOnDemand}</span>
              <span className="plan-balance-val">{data.on_demand}</span>
            </li>
          </ul>
          {data.free_period_end ? (
            <p className="muted">{t.planFreeResets.replace("{when}", formatWhen(data.free_period_end, locale))}</p>
          ) : null}
        </section>

        <section className="card pricing-card plan-block">
          <p className="feed-label">{t.planSectionTopUp}</p>
          <h2 className="pricing-name">{t.planTopUpTitle}</h2>
          {cryptoOn && !locked ? (
            <>
              <p className="pricing-blurb">{t.planCryptoHint}</p>
              {checkout ? (
                <form className="stack" onSubmit={(event) => void confirmPay(event)}>
                  <p className="muted">
                    {t.planCryptoPay
                      .replace("{amount}", checkout.amount_gen)
                      .replace("{label}", checkout.label)}
                  </p>
                  <label className="stack">
                    <span className="feed-label">{t.planCryptoAddress}</span>
                    <div className="row">
                      <code className="snippet" title={checkout.pay_to}>
                        {checkout.pay_to}
                      </code>
                      <button type="button" className="ghost" onClick={() => void copyPayTo()}>
                        {copied ? t.copied : t.copyAddress}
                      </button>
                    </div>
                  </label>
                  <label className="stack">
                    <span className="feed-label">{t.planCryptoTx}</span>
                    <input
                      value={tx}
                      onChange={(event) => setTx(event.target.value)}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="row">
                    <button
                      type="submit"
                      className="primary"
                      disabled={pending || !tx.trim()}
                      aria-busy={pending}
                    >
                      {pending ? t.planCryptoConfirming : t.planCryptoConfirm}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={pending}
                      onClick={() => {
                        setCheckout(null);
                        setTx("");
                      }}
                    >
                      {t.planCryptoCancel}
                    </button>
                  </div>
                </form>
              ) : (
                <ul className="pricing-packs">
                  {data.crypto!.offers.map((offer) => (
                    <li key={offer.code} className="card">
                      <div>
                        <strong>{offer.label}</strong>
                        <span>
                          {offer.amount_gen} GEN · {offer.credits} {t.planCreditsUnit}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="primary"
                        disabled={pending}
                        aria-busy={pending}
                        onClick={() => void startCheckout(offer.code)}
                      >
                        {t.planCryptoBuy}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="pricing-blurb">{t.planTopUpSoon}</p>
              <button type="button" className="primary" disabled>
                {t.planTopUpSoonCta}
              </button>
              <p className="muted">
                <Link href={`/${locale}/pricing`}>{t.planSeePricing}</Link>
              </p>
            </>
          )}
          {topUpError ? <p className="error" role="alert">{topUpError}</p> : null}
        </section>

        <section className="card pricing-card plan-block">
          <p className="feed-label">{t.planSectionCode}</p>
          <h2 className="pricing-name">{t.planCode}</h2>
          <p className="pricing-blurb">{t.planCodeHint}</p>
          {locked ? (
            <p className="muted">{t.planCodeLocked}</p>
          ) : (
            <form className="stack" onSubmit={(event) => void redeem(event)}>
              <input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  if (codeError) setCodeError(null);
                }}
                placeholder={t.planCodePlaceholder}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(codeError)}
              />
              {codeError ? <p className="error" role="alert">{codeError}</p> : null}
              <button type="submit" className="primary" disabled={pending || !code.trim()} aria-busy={pending}>
                {pending ? t.planRedeeming : t.planRedeem}
              </button>
            </form>
          )}
          {flash ? <p className="muted">{flash}</p> : null}
        </section>
      </div>

      <section className="card pricing-card plan-block plan-history">
        <p className="feed-label">{t.planSectionHistory}</p>
        <h2 className="pricing-name">{t.planHistoryTitle}</h2>
        {ledger.length === 0 ? (
          <p className="muted">{t.planHistoryEmpty}</p>
        ) : (
          <ul className="plan-ledger">
            {ledger.map((row) => (
              <li key={row.id}>
                <div className="plan-ledger-main">
                  <span className={`plan-ledger-delta${row.delta < 0 ? " is-out" : row.delta > 0 ? " is-in" : ""}`}>
                    {row.delta > 0 ? `+${row.delta}` : String(row.delta)}
                  </span>
                  <div className="plan-ledger-copy">
                    <strong>{reasonLabel(row.reason, t)}</strong>
                    {row.note ? <span className="muted">{row.note}</span> : null}
                    {row.case_id ? (
                      <span className="muted" title={row.case_id}>
                        {t.planHistoryCase.replace("{id}", row.case_id.slice(0, 12))}
                      </span>
                    ) : null}
                  </div>
                </div>
                <time className="muted" dateTime={row.created_at}>
                  {formatWhen(row.created_at, locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
