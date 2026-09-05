import { desc, eq } from "drizzle-orm";
import { walletTransfers } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { formatGen, parseGen } from "@/lib/gen/amount";
import { asHexAddress, ownerKey } from "@/lib/gen/chain";
import { ProtocolError } from "@/lib/protocol/errors";
import { mintToken } from "@/lib/protocol/keys";
import type { HousePrincipal } from "@/lib/protocol/bundle";
import { ensureHouseWallet, revealHouseWallet } from "./house-wallet";
import { estimateTransferReserve, transferFromHouse, walletBalance } from "./onchain";

export type TransferKind = "deposit" | "withdraw" | "court";

export type HouseTransfer = {
  id: string;
  kind: TransferKind;
  tx: string;
  from: string;
  to: string;
  amount: string;
  created_at: string;
};

export type HouseWalletView = {
  address: string;
  balance: string;
  balance_wei: string;
  withdrawable: string;
  court_contract: string | null;
  owner: string | null;
  transfers: HouseTransfer[];
};

export async function loadHouseWalletView(principal: HousePrincipal): Promise<HouseWalletView> {
  const wallet = await ensureHouseWallet(principal);
  const [wei, reserve] = await Promise.all([
    walletBalance(wallet.address).then((value) => value ?? BigInt(0)),
    estimateTransferReserve(wallet.accountKey),
  ]);
  const available = wei > reserve ? wei - reserve : BigInt(0);
  return {
    address: wallet.address,
    balance: formatGen(wei),
    balance_wei: wei.toString(),
    withdrawable: formatGen(available),
    court_contract: principal.courtContract,
    owner: principal.ownerAddress,
    transfers: await listTransfers(principal.id),
  };
}

export async function exportHouseWalletKey(principal: HousePrincipal): Promise<{ address: string; private_key: string }> {
  const wallet = await revealHouseWallet(principal);
  return { address: wallet.address, private_key: wallet.accountKey };
}

export async function recordDeposit(
  principal: HousePrincipal,
  input: { tx: string; from: string; gen: string; payer?: string | null },
): Promise<HouseWalletView> {
  const wallet = await ensureHouseWallet(principal);
  const from = asHexAddress(input.from);
  const tx = parseTx(input.tx);
  if (!from) throw new ProtocolError("bad_request", "from must be an address", 400);
  const payer = input.payer ? ownerKey(input.payer) : principal.ownerAddress ? ownerKey(principal.ownerAddress) : null;
  if (payer && payer !== ownerKey(from)) {
    throw new ProtocolError("forbidden", "Deposit must come from the signed-in wallet", 403);
  }
  let wei: bigint;
  try {
    wei = parseGen(input.gen);
  } catch (error) {
    throw new ProtocolError("bad_request", error instanceof Error ? error.message : "Invalid GEN amount", 400);
  }
  await insertTransfer({
    principalId: principal.id,
    kind: "deposit",
    tx,
    fromAddress: from,
    toAddress: wallet.address,
    amountWei: wei.toString(),
  });
  return loadHouseWalletView(principal);
}

export async function withdrawTo(
  principal: HousePrincipal,
  input: { to: string; gen: string },
): Promise<HouseWalletView> {
  const wallet = await ensureHouseWallet(principal);
  const to = asHexAddress(input.to) ?? (principal.ownerAddress ? asHexAddress(principal.ownerAddress) : null);
  if (!to) throw new ProtocolError("bad_request", "to must be an address", 400);
  let wei: bigint;
  try {
    wei = parseGen(input.gen);
  } catch (error) {
    throw new ProtocolError("bad_request", error instanceof Error ? error.message : "Invalid GEN amount", 400);
  }
  const balance = (await walletBalance(wallet.address)) ?? BigInt(0);
  const reserve = await estimateTransferReserve(wallet.accountKey);
  const max = balance > reserve ? balance - reserve : BigInt(0);
  if (max <= BigInt(0)) throw new ProtocolError("forbidden", "Need GEN left for the fee", 403);
  const send = wei > max ? max : wei;
  const tx = await transferFromHouse(wallet.accountKey, to, send);
  if (!tx) throw new ProtocolError("unavailable", "Withdraw did not land", 503);
  await insertTransfer({
    principalId: principal.id,
    kind: "withdraw",
    tx,
    fromAddress: wallet.address,
    toAddress: to,
    amountWei: send.toString(),
  });
  return loadHouseWalletView(principal);
}

export async function recordCourtTx(
  principal: HousePrincipal,
  tx: string | null,
  to: string | null,
): Promise<void> {
  if (!tx || !tx.startsWith("0x")) return;
  const wallet = principal.walletAddress;
  if (!wallet) return;
  await insertTransfer({
    principalId: principal.id,
    kind: "court",
    tx,
    fromAddress: wallet,
    toAddress: to && asHexAddress(to) ? to : wallet,
    amountWei: "0",
  });
}

async function listTransfers(principalId: string): Promise<HouseTransfer[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(walletTransfers)
    .where(eq(walletTransfers.principalId, principalId))
    .orderBy(desc(walletTransfers.createdAt))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as TransferKind,
    tx: row.tx,
    from: row.fromAddress,
    to: row.toAddress,
    amount: formatGen(BigInt(row.amountWei)),
    created_at: row.createdAt.toISOString(),
  }));
}

async function insertTransfer(row: {
  principalId: string;
  kind: TransferKind;
  tx: string;
  fromAddress: string;
  toAddress: string;
  amountWei: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(walletTransfers)
    .values({
      id: mintToken("wtx"),
      principalId: row.principalId,
      kind: row.kind,
      tx: row.tx,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      amountWei: row.amountWei,
    })
    .onConflictDoNothing({ target: walletTransfers.tx });
}

function parseTx(raw: string): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(raw)) {
    throw new ProtocolError("bad_request", "tx must be a hash", 400);
  }
  return raw;
}
