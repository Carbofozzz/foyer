"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { GENLAYER_RPC_URL, studioDevnet } from "@/lib/gen/chain";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "0123456789abcdef0123456789abcdef";

/** EIP-6963 lists each extension separately. No generic injected — that is always whoever stole window.ethereum. */
export const walletConfig = getDefaultConfig({
  appName: "Foyer",
  projectId,
  chains: [studioDevnet, mainnet],
  ssr: true,
  multiInjectedProviderDiscovery: true,
  wallets: [
    {
      groupName: "Wallets",
      wallets: [rainbowWallet, metaMaskWallet, rabbyWallet, walletConnectWallet],
    },
  ],
  transports: {
    [studioDevnet.id]: http(GENLAYER_RPC_URL),
    [mainnet.id]: http(),
  },
});
