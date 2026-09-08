import { studioDevnet, studionet } from "genlayer-js/chains";
import { ProtocolError } from "@/lib/protocol/errors";
import { resolveChain, walletBalance } from "./onchain";

/**
 * A court write is cheap to execute but the RPC asks for the whole fee budget
 * up front: about 0.1 GEN for a deploy. Below this floor nothing is submitted.
 */
export const COURT_FLOOR_WEI = BigInt(3) * BigInt(10) ** BigInt(17); // 0.3 GEN

const TOP_UP_WEI = BigInt(2) * BigInt(10) ** BigInt(18); // 2 GEN

/** Studio chains hand out test GEN over RPC; real networks do not. */
const FAUCET_CHAINS = new Set<number>([studioDevnet.id, studionet.id]);

function faucetUrl(): string | null {
  if (process.env.GENLAYER_FAUCET === "off") return null;
  const chain = resolveChain();
  if (!chain || !FAUCET_CHAINS.has(chain.id)) return null;
  return chain.rpcUrls.default.http[0] ?? null;
}

export function studioFaucetAvailable(): boolean {
  return faucetUrl() !== null;
}

async function callStudioFaucet(address: string): Promise<boolean> {
  const url = faucetUrl();
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sim_fundAccount",
        params: [address, TOP_UP_WEI.toString()],
      }),
    });
    const body = (await response.json()) as { error?: unknown };
    return !body.error;
  } catch {
    return false;
  }
}

/** Studio-dev RPC faucet. Always requests a top-up; waits until the balance moves. */
export async function requestStudioFaucet(address: string): Promise<bigint> {
  if (!faucetUrl()) {
    throw new ProtocolError("bad_request", "faucet is not available on this network", 400);
  }
  const before = (await walletBalance(address)) ?? BigInt(0);
  const ok = await callStudioFaucet(address);
  if (!ok) throw new ProtocolError("unavailable", "faucet declined", 503);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const fresh = (await walletBalance(address)) ?? BigInt(0);
    if (fresh > before) return fresh;
  }
  return (await walletBalance(address)) ?? before;
}

/**
 * Balance of the house wallet, topped up from the Studio faucet when it cannot
 * cover a court fee. Returns the balance so the caller can skip a doomed tx.
 */
export async function ensureCourtFunds(address: string): Promise<bigint> {
  const balance = (await walletBalance(address)) ?? BigInt(0);
  if (balance >= COURT_FLOOR_WEI) return balance;
  if (!faucetUrl()) return balance;
  try {
    await requestStudioFaucet(address);
  } catch {
    return (await walletBalance(address)) ?? balance;
  }
  return (await walletBalance(address)) ?? balance;
}
