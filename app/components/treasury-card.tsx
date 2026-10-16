"use client";

import { useCallback, useEffect, useState } from "react";
import { cabinetHeaders } from "@/app/lib/cabinet-request";
import { CopyButton } from "@/app/components/copy-button";
import { PagedList } from "@/app/components/paged-list";
import { addressExplorerUrl, txExplorerUrl } from "@/lib/gen/chain";
import { shortGen } from "@/lib/gen/amount";
import type { Messages } from "@/lib/i18n/load";
import { formatWhen } from "@/lib/i18n/when";
import { HOUSE_EVENT } from "@/lib/wallet/events";

type Transfer = {
  id: string;
  kind: "deposit" | "withdraw" | "court";
  tx: string;
  from: string;
  to: string;
  amount: string;
  case_id: string | null;
  created_at: string;
};

type WalletView = {
  address: string;
  balance: string;
  withdrawable?: string;
  owner: string | null;
  transfers: Transfer[];
};

/** Read-only house wallet: address, balance, history. Top-up and withdraw return with BILLING. */
export function TreasuryCard({
  token,
  houseId,
  locale = "en",
  locked = false,
  preview = null,
  t,
  errorLabel,
}: {
  token: string;
  houseId?: string;
  locale?: string;
  locked?: boolean;
  preview?: WalletView | null;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const [data, setData] = useState<WalletView | null>(preview);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/cabinet/${token}/treasury`, { headers: cabinetHeaders(houseId) })
      .then((response) => {
        if (!response.ok) throw new Error("fail");
        return response.json() as Promise<{ data: WalletView }>;
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
      const radio = document.getElementById("cabinet-tab-treasury");
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

  function kindLabel(kind: Transfer["kind"]) {
    if (kind === "deposit") return t.txDeposit;
    if (kind === "withdraw") return t.txWithdraw;
    return t.txCourt;
  }

  if (!data) {
    return error ? <p className="error">{error}</p> : <p className="muted">{t.treasuryLoading}</p>;
  }

  return (
    <div className="stack">
      <p className="wallet-balance" title={data.balance}>
        {shortGen(data.balance)} <span>GEN</span>
      </p>
      <div className="wallet-id">
        <AddressLink address={data.address} />
        <CopyButton text={data.address} copyLabel={t.copyAddress} copiedLabel={t.copied} />
      </div>
      {locked ? null : <p className="hint">{t.treasuryReadOnly}</p>}

      <p className="feed-label">{t.history}</p>
      {data.transfers.length === 0 ? (
        <p className="empty">{t.emptyHistory}</p>
      ) : (
        <PagedList className="tx-list" prevLabel={t.pagePrev} nextLabel={t.pageNext} pageOf={t.pageOf}>
          {data.transfers.map((row) => (
            <li key={row.id}>
              <span className="tx-kind">{kindLabel(row.kind)}</span>
              <span className={`tx-amount tx-${row.kind}`} title={row.kind === "court" ? undefined : row.amount}>
                {row.kind === "court" ? "" : `${row.kind === "withdraw" ? "−" : "+"}${shortGen(row.amount)} GEN`}
              </span>
              <span className="tx-meta">
                <time dateTime={row.created_at}>{formatWhen(row.created_at, locale)}</time>
                {row.case_id ? <span className="tx-case">{shortId(row.case_id)}</span> : null}
                <TxLink tx={row.tx} />
              </span>
            </li>
          ))}
        </PagedList>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function AddressLink({ address }: { address: string }) {
  const href = addressExplorerUrl(address);
  if (!href) return <p className="mono">{address}</p>;
  return (
    <a className="mono tx-link" href={href} target="_blank" rel="noreferrer">
      {address}
    </a>
  );
}

function shortId(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-4)}`;
}

function TxLink({ tx }: { tx: string }) {
  const href = txExplorerUrl(tx);
  const label = tx.length <= 18 ? tx : `${tx.slice(0, 10)}…${tx.slice(-6)}`;
  if (!href) return <span className="muted">{label}</span>;
  return (
    <a className="tx-link" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
