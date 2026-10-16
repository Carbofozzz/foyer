import { createAccount } from "genlayer-js";
import { unsealKey } from "@/lib/protocol/seal";

export type PlatformWallet = {
  address: `0x${string}`;
  accountKey: `0x${string}`;
};

let cached: PlatformWallet | null | undefined;

function parseKey(raw: string): `0x${string}` | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) return trimmed as `0x${string}`;
  try {
    const plain = unsealKey(trimmed);
    if (/^0x[a-fA-F0-9]{64}$/.test(plain)) return plain as `0x${string}`;
  } catch {
    /* not sealed */
  }
  return null;
}

/** Platform signing key from env. Raw `0x…` or sealed with FOYER_SEAL_SECRET. */
export function platformWallet(): PlatformWallet | null {
  if (cached !== undefined) return cached;
  const key = parseKey(process.env.GENLAYER_PLATFORM_KEY ?? "");
  if (!key) {
    cached = null;
    return null;
  }
  const account = createAccount(key);
  cached = { address: account.address, accountKey: key };
  return cached;
}

/** Test helper — clear the memoized key after env changes. */
export function resetPlatformWalletCache(): void {
  cached = undefined;
}

export function platformWalletConfigured(): boolean {
  return platformWallet() !== null;
}
