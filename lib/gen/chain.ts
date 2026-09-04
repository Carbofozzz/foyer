import { defineChain } from "viem";

/** Studio-dev (chain id 61997). Alias in env: studioDevnet / studionetdev. */
export const GENLAYER_CHAIN_ID = 61997;
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID.toString(16)}` as const;
export const GENLAYER_RPC_URL = "https://studio-dev.genlayer.com/api";
export const GENLAYER_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com";
export const GENLAYER_CHAIN_NAME = "GenLayer Studio Devnet";
export const GENLAYER_CURRENCY = {
  name: "GEN Token",
  symbol: "GEN",
  decimals: 18,
} as const;

export const studioDevnet = defineChain({
  id: GENLAYER_CHAIN_ID,
  name: GENLAYER_CHAIN_NAME,
  nativeCurrency: GENLAYER_CURRENCY,
  rpcUrls: {
    default: { http: [GENLAYER_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "GenLayer Explorer", url: GENLAYER_EXPLORER_URL },
  },
});

export function txExplorerUrl(tx: string): string | null {
  const hash = tx.startsWith("0x") ? tx : `0x${tx}`;
  if (!/^0x[a-fA-F0-9]{16,}$/.test(hash)) return null;
  return `${GENLAYER_EXPLORER_URL}/tx/${hash}`;
}

export function addressExplorerUrl(address: string): string | null {
  const hex = asHexAddress(address);
  if (!hex) return null;
  return `${GENLAYER_EXPLORER_URL}/address/${hex}`;
}

export function asHexAddress(value: string): `0x${string}` | null {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

/** Owner / session key: lowercase so login and deposit compare the same account. */
export function ownerKey(value: string): `0x${string}` | null {
  const hex = asHexAddress(value);
  return hex ? (hex.toLowerCase() as `0x${string}`) : null;
}
