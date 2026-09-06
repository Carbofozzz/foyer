import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAccount, createClient, isSuccessful } from "genlayer-js";
import { studioDevnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Address, CalldataEncodable, DecodedDeployData, TransactionHash } from "genlayer-js/types";
import { ACTION_KINDS, OUTCOMES, type ActionPayload, type JudgeInput, type VerdictAnswer } from "@/lib/protocol/types";
import { isRecord } from "@/lib/protocol/parse";
import { asHexAddress } from "@/lib/gen/chain";

export type JudgeExtra = {
  prior_verdict?: VerdictAnswer | null;
  appeal_note?: string;
};

export function resolveChain() {
  const raw = (process.env.GENLAYER_CHAIN ?? "studioDevnet").trim().toLowerCase();
  if (raw === "studiodevnet" || raw === "studionetdev" || raw === "studio-dev" || raw === "studiodev") {
    return studioDevnet;
  }
  if (raw === "studionet") return studionet;
  if (raw === "testnetasimov") return testnetAsimov;
  if (raw === "testnetbradbury") return testnetBradbury;
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

/** Deploy a court Intelligent Contract signed by this house wallet. */
export async function deployHouseCourt(accountKey: `0x${string}`): Promise<string | null> {
  try {
    return await withBudget(budgetMs(), () => submitDeploy(accountKey));
  } catch {
    return null;
  }
}

/** Submit a judge write and return the hash. Do not wait for finalization. */
export async function submitJudgeWrite(
  accountKey: `0x${string}`,
  contractAddress: string,
  caseId: string,
  input: JudgeInput,
  extra?: JudgeExtra,
): Promise<string | null> {
  const address = asAddress(contractAddress);
  if (!address) return null;
  try {
    return await writeJudge(accountKey, address, caseId, input, extra);
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

export async function readJudgeVerdict(
  contractAddress: string,
  caseId: string,
): Promise<VerdictAnswer | null> {
  const address = asAddress(contractAddress);
  const chain = resolveChain();
  if (!address || !chain) return null;
  try {
    const client = createClient({ chain });
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

function courtTxPhase(tx: {
  status?: TransactionStatus | number;
  statusName?: TransactionStatus;
  txExecutionResultName?: ExecutionResult;
}): CourtTxPhase {
  const status = tx.statusName ?? (typeof tx.status === "string" ? tx.status : undefined);
  const result = tx.txExecutionResultName;
  if (status === TransactionStatus.CANCELED) return "failed";
  if (status !== TransactionStatus.FINALIZED) return "pending";
  if (result === ExecutionResult.FINISHED_WITH_RETURN) return "ready";
  if (
    result === ExecutionResult.FINISHED_WITH_ERROR ||
    result === ExecutionResult.NONDET_DISAGREE ||
    result === ExecutionResult.TIMEOUT ||
    result === ExecutionResult.DETERMINISTIC_VIOLATION
  ) {
    return "failed";
  }
  return "pending";
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
    const estimate = await client.estimateTransactionFees();
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

async function submitDeploy(accountKey: `0x${string}`): Promise<string | null> {
  const client = clientFor(accountKey);
  if (!client) return null;
  let code: Uint8Array;
  try {
    code = new Uint8Array(readFileSync(join(process.cwd(), "contracts/court.py")));
  } catch {
    return null;
  }
  const account = createAccount(accountKey);
  const estimate = await client.estimateTransactionFees();
  const hash = (await client.deployContract({
    code,
    args: [account.address],
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  })) as TransactionHash;
  if (typeof hash !== "string" || !hash.startsWith("0x")) return null;
  const receipt = await client.waitForFinalization({ hash, ...waitOpts() });
  if (!isSuccessful(receipt)) return null;
  return contractAddressFromReceipt(receipt);
}

async function writeJudge(
  accountKey: `0x${string}`,
  address: Address,
  caseId: string,
  input: JudgeInput,
  extra?: JudgeExtra,
): Promise<string | null> {
  const client = clientFor(accountKey);
  if (!client) return null;
  const write = {
    address,
    functionName: "judge",
    args: [
      caseId,
      input.constitution,
      JSON.stringify(input.proposed_action),
      JSON.stringify(input.objection),
      JSON.stringify(input.evidence),
      extra?.prior_verdict ? JSON.stringify(extra.prior_verdict) : "",
      extra?.appeal_note ?? "",
    ] as CalldataEncodable[],
  };
  const estimate = await client.estimateTransactionFeesForWrite(write);
  const txHash = (await client.writeContract({
    ...write,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  })) as TransactionHash;
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) return null;
  return txHash;
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
  if (typeof body.outcome !== "string" || !OUTCOMES.includes(body.outcome as VerdictAnswer["outcome"])) {
    return null;
  }
  const outcome = body.outcome as VerdictAnswer["outcome"];
  const reasoning = typeof body.reasoning === "string" && body.reasoning.trim() ? body.reasoning.trim() : "No reasoning given.";
  const objection_grounded = Boolean(body.objection_grounded);
  let remedy_action: ActionPayload | null = null;
  if (outcome === "remedy") {
    remedy_action = parseRemedy(body.remedy_action);
    if (!remedy_action) return null;
  }
  return { outcome, remedy_action, reasoning, objection_grounded };
}

function parseRemedy(raw: unknown): ActionPayload | null {
  if (!isRecord(raw) || typeof raw.kind !== "string" || !ACTION_KINDS.includes(raw.kind as ActionPayload["kind"])) {
    return null;
  }
  if (typeof raw.summary !== "string" || !raw.summary.trim()) return null;
  const payload: ActionPayload = { kind: raw.kind as ActionPayload["kind"], summary: raw.summary.trim() };
  if (typeof raw.amount === "number" && Number.isFinite(raw.amount)) payload.amount = raw.amount;
  if (typeof raw.currency === "string" && raw.currency.trim()) payload.currency = raw.currency.trim();
  return payload;
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
