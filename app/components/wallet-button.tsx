"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { loginMessage } from "@/lib/protocol/login-message";
import { AUTH_EVENT, notifyAuthChanged } from "@/lib/wallet/events";

export function WalletButton({
  locale,
  signOutLabel,
  connectLabel,
  signingInLabel,
  cabinetLabel,
  initialAddress,
}: {
  locale: string;
  signOutLabel: string;
  connectLabel: string;
  signingInLabel?: string;
  cabinetLabel?: string;
  initialAddress?: string | null;
}) {
  const { address, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddr, setSessionAddr] = useState<string | null>(initialAddress ?? null);
  const [sessionReady, setSessionReady] = useState(initialAddress !== undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function load() {
      fetch("/api/me")
        .then((response) => response.json() as Promise<{ data: { address: string | null } }>)
        .then((payload) => setSessionAddr(payload.data.address))
        .catch(() => setSessionAddr(null))
        .finally(() => setSessionReady(true));
    }
    load();
    window.addEventListener(AUTH_EVENT, load);
    return () => window.removeEventListener(AUTH_EVENT, load);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    if (isConnected) await disconnectAsync();
    notifyAuthChanged();
    window.location.assign(`/${locale}`);
  }

  async function signIn(openConnectModal: () => void) {
    if (!isConnected || !address) {
      openConnectModal();
      return;
    }
    setBusy(true);
    try {
      const nonceResponse = await fetch("/api/auth/nonce");
      if (!nonceResponse.ok) return;
      const noncePayload = (await nonceResponse.json()) as { data: { nonce: string } };
      const message = loginMessage(noncePayload.data.nonce);
      const signature = await signMessageAsync({ message });
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (verifyResponse.ok) notifyAuthChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConnectButton.Custom>
      {({ account, openConnectModal, mounted }) => {
        if (!mounted || !sessionReady) {
          return <WalletSkeleton cabinet={Boolean(cabinetLabel)} signedIn={Boolean(sessionAddr)} />;
        }
        if (sessionAddr) {
          return (
            <div className="wallet-toolbar">
              {cabinetLabel ? (
                <a className="primary" href={`/${locale}/cabinet`}>
                  {cabinetLabel}
                </a>
              ) : null}
              <span className="mono muted">{account?.displayName ?? shortAddr(sessionAddr)}</span>
              <button type="button" className="ghost" onClick={() => void signOut()}>
                {signOutLabel}
              </button>
            </div>
          );
        }
        return (
          <button
            type="button"
            className="primary"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void signIn(openConnectModal)}
          >
            {busy ? (signingInLabel ?? connectLabel) : connectLabel}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

function shortAddr(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function WalletSkeleton({ cabinet, signedIn }: { cabinet: boolean; signedIn: boolean }) {
  if (!signedIn) return <span className="skeleton skeleton-btn" aria-hidden />;
  return (
    <div className="wallet-toolbar" aria-hidden>
      {cabinet ? <span className="skeleton skeleton-btn" /> : null}
      <span className="skeleton skeleton-addr" />
      <span className="skeleton skeleton-ghost" />
    </div>
  );
}
