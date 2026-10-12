"use client";

import { useCallback, useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import type { Messages } from "@/lib/i18n/load";
import { HOUSE_EVENT } from "@/lib/wallet/events";

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
};

export function PlanCard({
  token,
  houseId,
  locked = false,
  preview = null,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  locked?: boolean;
  preview?: PlanView | null;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [data, setData] = useState<PlanView | null>(preview);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/cabinet/${token}/plan`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: PlanView }>;
      })
      .then((payload) => {
        setData(payload.data);
        setError(null);
      })
      .catch(() => setError(errorLabel));
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
    setError(null);
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
        setError(payload?.error?.message ?? errorLabel);
        return;
      }
      setData(payload.data);
      setCode("");
      const granted = payload.data.redeemed?.credits_granted ?? 0;
      setFlash(t.planRedeemed.replace("{n}", String(granted)));
    } catch {
      setError(errorLabel);
    } finally {
      setPending(false);
    }
  }

  if (!data) {
    return error ? <p className="error">{error}</p> : <p className="muted">{t.planLoading}</p>;
  }

  return (
    <div className="stack">
      <p className="wallet-balance" title={String(data.credits)}>
        {data.credits} <span>{t.planCreditsUnit}</span>
      </p>
      <p className="hint">{t.planHint}</p>
      <ul className="stack muted">
        {data.free_quota > 0 ? (
          <li>
            {t.planFreeLine
              .replace("{left}", String(data.free_remaining))
              .replace("{n}", String(data.free_quota))}
          </li>
        ) : null}
        <li>{t.planSubLine.replace("{n}", String(data.subscription_credits))}</li>
        <li>{t.planOnDemandLine.replace("{n}", String(data.on_demand))}</li>
      </ul>
      {data.in_grace ? <p className="hint">{t.planInGrace}</p> : null}
      {data.feature_org ? <p className="muted">{t.planOrgOn}</p> : <p className="muted">{t.planOrgOff}</p>}
      {!data.gate ? <p className="muted">{t.planGateOff}</p> : null}

      {locked ? null : (
        <form className="stack" onSubmit={(event) => void redeem(event)}>
          <label className="stack">
            <span className="feed-label">{t.planCode}</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t.planCodePlaceholder}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="primary" disabled={pending || !code.trim()} aria-busy={pending}>
            {pending ? t.planRedeeming : t.planRedeem}
          </button>
        </form>
      )}
      {flash ? <p className="muted">{flash}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <p className="hint">{t.planTopUpSoon}</p>
    </div>
  );
}
