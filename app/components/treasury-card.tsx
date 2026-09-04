"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import { CopyButton } from "@/app/components/copy-button";
import { addressExplorerUrl, asHexAddress, GENLAYER_CHAIN_ID, ownerKey, txExplorerUrl } from "@/lib/gen/chain";
import { parseGen } from "@/lib/gen/amount";
import type { Messages } from "@/lib/i18n/load";

type Transfer = {
  id: string;
  kind: "deposit" | "withdraw" | "court";
  tx: string;
  from: string;
  to: string;
  amount: string;
  created_at: string;
};

type WalletView = {
  address: string;
  balance: string;
  withdrawable?: string;
  owner: string | null;
  transfers: Transfer[];
};

export function TreasuryCard({
  token,
  t,
  errorLabel,
}: {
  token: string;
  t: Messages["cabinet"];
  errorLabel: string;
}) {
  const { address: connected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: GENLAYER_CHAIN_ID });
  const [data, setData] = useState<WalletView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "deposit" | "withdraw">("idle");
  const [amount, setAmount] = useState("0.1");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | "export" | "refresh" | null>(null);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const hasBalance = Boolean(data && data.balance !== "0");
  const owner = data?.owner ? ownerKey(data.owner) : null;

  const fetchView = useCallback(async () => {
    const response = await fetch(`/api/cabinet/${token}/treasury`);
    if (!response.ok) throw new Error("fail");
    const payload = (await response.json()) as { data: WalletView };
    return payload.data;
  }, [token]);

  const load = useCallback(() => {
    fetchView()
      .then((view) => {
        setData(view);
        setWithdrawTo((current) => current || view.owner || "");
        setError(null);
      })
      .catch(() => setError(errorLabel));
  }, [fetchView, errorLabel]);

  const settle = useCallback(
    async (before: WalletView | null) => {
      for (let i = 0; i < 10; i++) {
        await sleep(1500);
        try {
          const next = await fetchView();
          setData(next);
          if (!before || next.balance !== before.balance) return;
        } catch {
          // RPC can lag; keep polling.
        }
      }
    },
    [fetchView],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function deposit() {
    if (!data) return;
    if (!connected) {
      openConnectModal?.();
      return;
    }
    const house = asHexAddress(data.address);
    if (!house) return;
    if (owner && ownerKey(connected) !== owner) {
      setError(t.wrongWallet);
      return;
    }
    const before = data;
    setBusy("deposit");
    try {
      await switchChainAsync({ chainId: GENLAYER_CHAIN_ID });
      const wei = parseGen(amount);
      const tx = await sendTransactionAsync({ to: house, value: wei });
      try {
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 60_000 });
        }
      } catch {
        // Studio-dev receipt can lag; the treasury poll will catch the balance.
      }
      const response = await fetch(`/api/cabinet/${token}/treasury`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit: true, tx, from: connected, gen: amount }),
      });
      if (!response.ok) throw new Error("fail");
      const payload = (await response.json()) as { data: WalletView };
      setData(payload.data);
      setMode("idle");
      setError(null);
      setBusy("refresh");
      await settle(before);
    } catch {
      setError(errorLabel);
    }
    setBusy(null);
  }

  async function withdraw() {
    if (!data) return;
    const before = data;
    setBusy("withdraw");
    try {
      const response = await fetch(`/api/cabinet/${token}/treasury`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdraw: true, to: withdrawTo || owner || connected, gen: amount }),
      });
      if (!response.ok) throw new Error("fail");
      const payload = (await response.json()) as { data: WalletView };
      setData(payload.data);
      setMode("idle");
      setError(null);
      setBusy("refresh");
      await settle(before);
    } catch {
      setError(errorLabel);
    }
    setBusy(null);
  }

  function openWithdraw() {
    if (!data) return;
    setAmount(data.withdrawable && data.withdrawable !== "0" ? data.withdrawable : data.balance);
    setMode("withdraw");
  }

  async function exportKey() {
    setBusy("export");
    const response = await fetch(`/api/cabinet/${token}/treasury`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ export: true }),
    });
    setBusy(null);
    if (!response.ok) {
      setError(errorLabel);
      return;
    }
    const payload = (await response.json()) as { data: { private_key: string } };
    setPrivateKey(payload.data.private_key);
    setError(null);
  }

  function kindLabel(kind: Transfer["kind"]) {
    if (kind === "deposit") return t.txDeposit;
    if (kind === "withdraw") return t.txWithdraw;
    return t.txCourt;
  }

  return (
    <section className="cabinet-panel">
      <div className="cabinet-panel-head">
        <h2 className="section-title">{t.treasury}</h2>
      </div>

      {data ? (
        <>
          <button
            type="button"
            className="wallet-balance"
            disabled={!hasBalance && mode !== "deposit"}
            onClick={() => {
              if (hasBalance && mode === "idle") openWithdraw();
            }}
          >
            {data.balance} <span>GEN</span>
          </button>
          {busy === "refresh" ? <p className="muted">{t.refreshing}</p> : null}
          <div className="wallet-id">
            <AddressLink address={data.address} />
            <CopyButton text={data.address} copyLabel={t.copyAddress} copiedLabel={t.copied} />
          </div>

          {mode === "idle" ? (
            <div className="wallet-actions">
              <button type="button" className="primary" onClick={() => setMode("deposit")}>
                {t.deposit}
              </button>
              <button type="button" disabled={!hasBalance} onClick={openWithdraw}>
                {t.withdraw}
              </button>
            </div>
          ) : mode === "deposit" ? (
            <div className="wallet-field">
              <label>
                {t.depositAmount}
                <input value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <div className="wallet-actions">
                <button type="button" className="primary" onClick={() => void deposit()} disabled={busy !== null}>
                  {busy === "deposit" ? t.depositing : t.deposit}
                </button>
                <button type="button" className="ghost" onClick={() => setMode("idle")} disabled={busy !== null}>
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="wallet-field">
              <p className="hint">{t.withdrawHint}</p>
              <label>
                {t.withdrawAmount}
                <input value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <label>
                {t.withdrawTo}
                <input
                  value={withdrawTo}
                  onChange={(event) => setWithdrawTo(event.target.value)}
                  placeholder={owner ?? connected ?? "0x…"}
                />
              </label>
              <div className="wallet-actions">
                <button type="button" className="primary" onClick={() => void withdraw()} disabled={busy !== null || !hasBalance}>
                  {busy === "withdraw" ? t.withdrawing : t.withdraw}
                </button>
                <button type="button" className="ghost" onClick={() => setMode("idle")} disabled={busy !== null}>
                  {t.cancel}
                </button>
              </div>
            </div>
          )}

          <div className="cabinet-scroll">
            <p className="feed-label">{t.history}</p>
            {data.transfers.length === 0 ? (
              <p className="empty">{t.emptyHistory}</p>
            ) : (
              <ul className="tx-list">
                {data.transfers.map((row) => (
                  <li key={row.id}>
                    <span>{kindLabel(row.kind)}</span>
                    <span>{row.kind === "court" ? "—" : `${row.amount} GEN`}</span>
                    <TxLink tx={row.tx} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details>
            <summary>{t.exportKey}</summary>
            {privateKey ? (
              <>
                <p className="hint">{t.privateKeyHint}</p>
                <p className="mono">{privateKey}</p>
                <CopyButton text={privateKey} copyLabel={t.copyKey} copiedLabel={t.copied} />
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => void exportKey()} disabled={busy !== null}>
                {busy === "export" ? t.exporting : t.exportKey}
              </button>
            )}
          </details>
        </>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <p className="muted">{t.treasuryLoading}</p>
      )}
      {data && error ? <p className="error">{error}</p> : null}
    </section>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortAddr(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function AddressLink({ address }: { address: string }) {
  const href = addressExplorerUrl(address);
  const label = shortAddr(address);
  if (!href) return <p className="mono">{label}</p>;
  return (
    <a className="mono tx-link" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
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
