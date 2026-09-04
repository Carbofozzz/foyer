"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  lightTheme,
  type AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import type { Locale } from "@/lib/i18n/config";
import { loginMessage } from "@/lib/protocol/login-message";
import { studioDevnet } from "@/lib/gen/chain";
import { walletConfig } from "@/lib/wallet/config";
import { notifyAuthChanged } from "@/lib/wallet/events";
import { rainbowLocale } from "@/lib/wallet/locale";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const theme = lightTheme({
  accentColor: "#8a5a2b",
  accentColorForeground: "#fffdf8",
  borderRadius: "small",
  fontStack: "system",
});

export function WalletProviders({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const fetchingRef = useRef(false);
  const verifyingRef = useRef(false);
  const [status, setStatus] = useState<AuthenticationStatus>("loading");

  useEffect(() => {
    async function refresh() {
      if (fetchingRef.current || verifyingRef.current) return;
      fetchingRef.current = true;
      try {
        const response = await fetch("/api/me");
        const payload = (await response.json()) as { data?: { address: string | null } };
        setStatus(payload.data?.address ? "authenticated" : "unauthenticated");
      } catch {
        setStatus("unauthenticated");
      } finally {
        fetchingRef.current = false;
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const response = await fetch("/api/auth/nonce");
          if (!response.ok) throw new Error("nonce");
          const payload = (await response.json()) as { data: { nonce: string } };
          return payload.data.nonce;
        },
        createMessage: ({ nonce }) => loginMessage(nonce),
        verify: async ({ message, signature }) => {
          verifyingRef.current = true;
          try {
            const response = await fetch("/api/auth/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message, signature }),
            });
            const ok = response.ok;
            setStatus(ok ? "authenticated" : "unauthenticated");
            if (ok) notifyAuthChanged();
            return ok;
          } catch {
            setStatus("unauthenticated");
            return false;
          } finally {
            verifyingRef.current = false;
          }
        },
        signOut: async () => {
          setStatus("unauthenticated");
          await fetch("/api/auth/logout", { method: "POST" });
          notifyAuthChanged();
        },
      }),
    [],
  );

  return (
    <WagmiProvider config={walletConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
          <RainbowKitProvider
            locale={rainbowLocale(locale)}
            theme={theme}
            initialChain={studioDevnet}
            modalSize="wide"
          >
            {children}
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
