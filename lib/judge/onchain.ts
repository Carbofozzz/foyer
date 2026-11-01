import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAccount, createClient, isSuccessful } from "genlayer-js";
import { studioDevnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type {
  Address,
  CalldataEncodable,
  DecodedDeployData,
  GenLayerChain,
  GenLayerTransaction,
  TransactionHash,
} from "genlayer-js/types";
import { type JudgeInput, type VerdictAnswer } from "@/lib/protocol/types";
import { isRecord } from "@/lib/protocol/parse";
import { asHexAddress } from "@/lib/gen/chain";
import { normalizeCourtOutcome } from "@/lib/protocol/verdict";

/** Optional RPC override (boilerplate Studio Next alias: https://studio-next.genlayer.com/api). */
function rpcOverride(): string | null {
  const url = (process.env.GENLAYER_RPC_URL ?? process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "").trim();
  return url || null;
}

function withRpc(chain: GenLayerChain, rpcUrl?: string | null): GenLayerChain {
  const url = rpcUrl?.trim() || rpcOverride();
  if (!url) return chain;
  return { ...chain, rpcUrls: { default: { http: [url] } } };
}

export function resolveChain() {
  const raw = (process.env.GENLAYER_CHAIN ?? "studioDevnet").trim().toLowerCase().replace(/_/g, "-");
  if (raw === "studio-next" || raw === "studionext") {
    return withRpc(
      { ...studioDevnet, name: "GenLayer Studio Next" },
      rpcOverride() ?? "https://studio-next.genlayer.com/api",
    );
  }
  if (raw === "studiodevnet" || raw === "studionetdev" || raw === "studio-dev" || raw === "studiodev") {
    return withRpc(studioDevnet);
  }
  if (raw === "studionet") return withRpc(studionet);
  if (raw === "testnetasimov") return withRpc(testnetAsimov);
  if (raw === "testnetbradbury") return withRpc(testnetBradbury);
  return null;
}

function waitOpts() {
  return {
    interval: Number(process.env.GENLAYER_TX_WAIT_INTERVAL_MS ?? 5_000),
    retries: Number(process.env.GENLAYER_TX_WAIT_RETRIES ?? 24),
  };
}

function asAddress(value: string): Address | null {
  return asHexAddress(value);
}

/** A leader plus validators on a judge write take about a minute on studio-dev. */
function budgetMs(): number {
  return Number(process.env.GENLAYER_BUDGET_MS ?? 100_000);
}

function clientFor(accountKey: `0x${string}`) {
  const chain = resolveChain();
  if (!chain) return null;
  return createClient({ chain, account: createAccount(accountKey) });
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const fundedCaller = new AsyncLocalStorage<string>();
let fetchPatched = false;

/** genlayer-js reads the fee manager with eth_call and no sender. Bradbury rejects the zero address. */
function installFundedFetch() {
  if (fetchPatched) return;
  fetchPatched = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const from = fundedCaller.getStore();
    if (from && init && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as { method?: string; params?: unknown[] };
        const method = body.method;
        const tx = body.params?.[0];
        if (
          (method === "eth_call" || method === "eth_estimateGas") &&
          tx &&
          typeof tx === "object" &&
          (!("from" in tx) || String((tx as { from?: string }).from ?? "").toLowerCase() === ZERO_ADDRESS)
        ) {
          body.params![0] = { ...(tx as object), from };
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        // Not a JSON-RPC body.
      }
    }
    return original(input, init);
  }) as typeof fetch;
}

function withFundedCalls<T>(address: string, run: () => Promise<T>): Promise<T> {
  installFundedFetch();
  return fundedCaller.run(address, run);
}

export type CourtSubmitResult = {
  hash: string;
  estimatedWei: bigint;
};

/** Deploy a court Intelligent Contract signed by the given key (platform wallet). */
export async function deployHouseCourt(
  accountKey: `0x${string}`,
): Promise<(CourtSubmitResult & { address: string }) | null> {
  const wait = waitOpts();
  const waitMs = wait.interval * wait.retries + 20_000;
  try {
    return await withBudget(Math.max(budgetMs(), waitMs), () => submitDeploy(accountKey));
  } catch {
    return null;
  }
}

/** Submit a judge write and return the hash + fee estimate. Do not wait for finalization. */
export async function submitJudgeWrite(
  accountKey: `0x${string}`,
  contractAddress: string,
  caseId: string,
  input: JudgeInput,
): Promise<CourtSubmitResult | null> {
  const address = asAddress(contractAddress);
  if (!address) return null;
  try {
    return await writeJudge(accountKey, address, caseId, input);
  } catch {
    return null;
  }
}

export type CourtTxPhase = "pending" | "ready" | "failed";

/** One stored GenLayer lifecycle read. Never invents a verdict. */
export async function inspectJudgeTx(hash: string): Promise<CourtTxPhase> {
  if (!hash.startsWith("0x")) return "pending";
  const chain = resolveChain();
  if (!chain) return "pending";
  try {
    const client = createClient({ chain });
    const tx = await client.getTransaction({ hash: hash as TransactionHash });
    return courtTxPhase(tx);
  } catch {
    return "pending";
  }
}

export type NativeTransferView = {
  phase: CourtTxPhase;
  from: string | null;
  to: string | null;
  valueWei: bigint;
};

/** Read a native GEN transfer for crypto checkout verification. */
export async function readNativeTransfer(hash: string): Promise<NativeTransferView | null> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  const chain = resolveChain();
  if (!chain) return null;
  try {
    const client = createClient({ chain });
    const tx = await client.getTransaction({ hash: hash as TransactionHash });
    const from = String(tx.from_address ?? tx.sender ?? "");
    const to = String(tx.to_address ?? tx.recipient ?? "");
    let valueWei = BigInt(0);
    if (typeof tx.value === "bigint") valueWei = tx.value;
    else if (typeof tx.value === "number" && Number.isFinite(tx.value)) valueWei = BigInt(Math.trunc(tx.value));
    else if (typeof tx.value === "string" && /^\d+$/.test(tx.value)) valueWei = BigInt(tx.value);
    return {
      phase: courtTxPhase(tx),
      from: asAddress(from) ?? null,
      to: asAddress(to) ?? null,
      valueWei,
    };
  } catch {
    return null;
  }
}

export async function readJudgeVerdict(
  contractAddress: string,
  caseId: string,
  accountKey?: `0x${string}`,
): Promise<VerdictAnswer | null> {
  const address = asAddress(contractAddress);
  const chain = resolveChain();
  if (!address || !chain) return null;
  try {
    const client = accountKey ? clientFor(accountKey) : createClient({ chain });
    if (!client) return null;
    const raw = await client.readContract({
      address,
      functionName: "get_verdict",
      args: [caseId],
    });
    return parseAnswer(raw);
  } catch {
    return null;
  }
}

function executionFailed(result: ExecutionResult | undefined): boolean {
  return (
    result === ExecutionResult.FINISHED_WITH_ERROR ||
    result === ExecutionResult.NONDET_DISAGREE ||
    result === ExecutionResult.TIMEOUT ||
    result === ExecutionResult.DETERMINISTIC_VIOLATION
  );
}

/** Consensus v0.6: wait until finalized. Do not require FINISHED_WITH_RETURN by name — Studio may omit it. */
function courtTxPhase(tx: Pick<GenLayerTransaction, "lifecycle" | "status" | "statusName" | "txExecutionResultName">): CourtTxPhase {
  const result = tx.txExecutionResultName;
  const life = tx.lifecycle;
  const status = tx.statusName ?? (typeof tx.status === "string" ? tx.status : undefined);
  const canceled = life?.state === "canceled" || status === TransactionStatus.CANCELED;
  const finalized = life?.state === "finalized" || status === TransactionStatus.FINALIZED;
  if (canceled) return "failed";
  if (!finalized) return "pending";
  if (executionFailed(result)) return "failed";
  return "ready";
}

const EQ_TYPE_STR = 4;
const EQ_TYPE_MAP = 6;
const EQ_TRUE = 2 << 3;
const EQ_FALSE = 1 << 3;

function readUleb(data: Uint8Array, index: { i: number }): bigint {
  let res = BigInt(0);
  let accum = BigInt(0);
  while (index.i < data.length) {
    const byte = data[index.i++] ?? 0;
    res += BigInt(byte & 127) * (BigInt(1) << accum);
    accum += BigInt(7);
    if (byte < 128) return res;
  }
  throw new Error("truncated eq");
}

function decodeEq(data: Uint8Array, index: { i: number }): unknown {
  const cur = readUleb(data, index);
  if (cur === BigInt(EQ_TRUE)) return true;
  if (cur === BigInt(EQ_FALSE)) return false;
  if (cur === BigInt(0)) return null;
  const type = Number(cur & BigInt(0xff)) & 7;
  const rest = cur >> BigInt(3);
  if (type === EQ_TYPE_STR) {
    const size = Number(rest);
    const slice = data.slice(index.i, index.i + size);
    index.i += size;
    return new TextDecoder().decode(slice);
  }
  if (type === EQ_TYPE_MAP) {
    const map = new Map<string, unknown>();
    for (let left = Number(rest); left > 0; left -= 1) {
      const size = Number(readUleb(data, index));
      const key = new TextDecoder().decode(data.slice(index.i, index.i + size));
      index.i += size;
      map.set(key, decodeEq(data, index));
    }
    return map;
  }
  throw new Error("unsupported eq");
}

/** Bradbury stores the judge dict in the tx eq output. The chain RPC has no gen_call. */
function verdictFromEq(hex: string): VerdictAnswer | null {
  if (!hex.startsWith("0x") || hex.length < 4) return null;
  const bytes = Uint8Array.from(Buffer.from(hex.slice(2), "hex"));
  for (let start = 0; start < bytes.length; start += 1) {
    try {
      const value = decodeEq(bytes, { i: start });
      if (!(value instanceof Map)) continue;
      const outcome = normalizeCourtOutcome(String(value.get("outcome") ?? ""));
      if (!outcome) continue;
      const reasoning = String(value.get("reasoning") ?? "").trim() || "No reasoning given.";
      return {
        outcome,
        remedy_action: null,
        reasoning,
        objection_grounded: value.get("objection_grounded") === true,
      };
    } catch {
      // Not a verdict map at this offset.
    }
  }
  return null;
}

export async function verdictFromJudgeTx(hash: string): Promise<VerdictAnswer | null> {
  if (!hash.startsWith("0x")) return null;
  const chain = resolveChain();
  if (!chain) return null;
  try {
    const client = createClient({ chain });
    const tx = await client.getTransaction({ hash: hash as TransactionHash });
    if (courtTxPhase(tx) !== "ready") return null;
    const hex = tx.eqBlocksOutputs;
    if (typeof hex !== "string") return null;
    return verdictFromEq(hex);
  } catch {
    return null;
  }
}

export async function walletBalance(address: string): Promise<bigint | null> {
  const chain = resolveChain();
  const parsed = asAddress(address);
  if (!chain || !parsed) return null;
  try {
    const client = createClient({ chain });
    return await client.getBalance({ address: parsed });
  } catch {
    return null;
  }
}

const FEE_FALLBACK = BigInt(10) ** BigInt(16); // 0.01 GEN
const FEE_CAP = BigInt(5) * BigInt(10) ** BigInt(16); // 0.05 GEN

/** Leave this much GEN on the house wallet so a transfer can pay its own fee. */
export async function estimateTransferReserve(accountKey: `0x${string}`): Promise<bigint> {
  const client = clientFor(accountKey);
  if (!client) return FEE_FALLBACK;
  try {
    const estimate = await withFundedCalls(createAccount(accountKey).address, () => client.estimateTransactionFees());
    const padded = (estimate.feeValue * BigInt(15)) / BigInt(10);
    if (padded <= BigInt(0)) return FEE_FALLBACK;
    return padded > FEE_CAP ? FEE_CAP : padded;
  } catch {
    return FEE_FALLBACK;
  }
}

/** Native GEN send from the house wallet to the principal's address. */
export async function transferFromHouse(
  accountKey: `0x${string}`,
  to: Address,
  value: bigint,
): Promise<string | null> {
  const client = clientFor(accountKey);
  if (!client) return null;
  try {
    return await withBudget(budgetMs(), async () => {
      const receipt = await client.transfer({ to, value });
      const hash =
        receipt && typeof receipt === "object" && "transactionHash" in receipt
          ? String((receipt as { transactionHash?: unknown }).transactionHash ?? "")
          : "";
      if (!hash.startsWith("0x")) return null;
      await client.waitForFinalization({ hash: hash as TransactionHash, ...waitOpts() });
      return hash;
    });
  } catch {
    return null;
  }
}

async function submitDeploy(accountKey: `0x${string}`): Promise<(CourtSubmitResult & { address: string }) | null> {
  const client = clientFor(accountKey);
  if (!client) return null;
  let code: Uint8Array;
  try {
    code = new Uint8Array(readFileSync(join(process.cwd(), "contracts/court.py")));
  } catch {
    return null;
  }
  const account = createAccount(accountKey);
  const estimate = await withFundedCalls(account.address, () => client.estimateTransactionFees());
  const estimatedWei = BigInt(estimate.feeValue ?? 0);
  const hash = (await withFundedCalls(account.address, () => client.deployContract({
    code,
    args: [account.address],
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  }))) as TransactionHash;
  if (typeof hash !== "string" || !hash.startsWith("0x")) return null;
  const receipt = await client.waitForFinalization({ hash, ...waitOpts() });
  if (!isSuccessful(receipt)) return null;
  const address = contractAddressFromReceipt(receipt);
  if (!address) return null;
  return { hash, estimatedWei, address };
}

async function writeJudge(
  accountKey: `0x${string}`,
  address: Address,
  caseId: string,
  input: JudgeInput,
): Promise<CourtSubmitResult | null> {
  const client = clientFor(accountKey);
  if (!client) return null;
  const write = {
    address,
    functionName: "judge",
    args: [
      caseId,
      input.constitution,
      JSON.stringify(input.proposed_action),
      JSON.stringify(input.objections),
      JSON.stringify(input.evidence),
    ] as CalldataEncodable[],
  };
  const account = createAccount(accountKey);
  // Bradbury's chain RPC has no gen_call, so a simulated write estimate cannot run.
  const estimate = await withFundedCalls(account.address, () => client.estimateTransactionFees());
  const estimatedWei = BigInt(estimate.feeValue ?? 0);
  const txHash = (await withFundedCalls(account.address, () => client.writeContract({
    ...write,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  }))) as TransactionHash;
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) return null;
  return { hash: txHash, estimatedWei };
}

function contractAddressFromReceipt(receipt: { txDataDecoded?: unknown; data?: unknown }): string | null {
  const decoded = receipt.txDataDecoded as DecodedDeployData | undefined;
  if (decoded?.contractAddress && asAddress(decoded.contractAddress)) return decoded.contractAddress;
  const data = receipt.data;
  if (data && typeof data === "object" && "contract_address" in data) {
    const raw = String((data as { contract_address?: unknown }).contract_address ?? "");
    if (asAddress(raw)) return raw;
  }
  return null;
}

function parseAnswer(raw: unknown): VerdictAnswer | null {
  let body: unknown = raw;
  if (typeof raw === "string") {
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(body) || body.found === false) return null;
  if (typeof body.outcome !== "string") return null;
  const outcome = normalizeCourtOutcome(body.outcome);
  if (!outcome) return null;
  const reasoning = typeof body.reasoning === "string" && body.reasoning.trim() ? body.reasoning.trim() : "No reasoning given.";
  const objection_grounded = Boolean(body.objection_grounded);
  return { outcome, remedy_action: null, reasoning, objection_grounded };
}

async function withBudget<T>(ms: number, fn: () => Promise<T | null>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = fn();
  work.catch(() => {});
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
