import { studioDevnet, studionet } from "genlayer-js/chains";
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

/**
 * Balance of the house wallet, topped up from the Studio faucet when it cannot
 * cover a court fee. Returns the balance so the caller can skip a doomed tx.
 */
export async function ensureCourtFunds(address: string): Promise<bigint> {
  const balance = (await walletBalance(address)) ?? BigInt(0);
  if (balance >= COURT_FLOOR_WEI) return balance;

  const url = faucetUrl();
  if (!url) return balance;
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
    if (body.error) return balance;
  } catch {
    return balance;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const fresh = (await walletBalance(address)) ?? BigInt(0);
    if (fresh >= COURT_FLOOR_WEI) return fresh;
  }
  return (await walletBalance(address)) ?? balance;
}
