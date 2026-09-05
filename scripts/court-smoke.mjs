#!/usr/bin/env node
/**
 * End-to-end smoke of the court Intelligent Contract on a Studio chain:
 * fund a throwaway wallet from the faucet, deploy `contracts/court.py`, run one
 * `judge` write and read the verdict back. Prints real fee cost and wall time.
 *
 *   npm run court:smoke
 *
 * On a contract error it prints the GenVM traceback, which is the only place
 * a Python mistake in the contract becomes visible.
 */
import { readFileSync } from "node:fs";
import { createAccount, createClient, generatePrivateKey, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const chain = studioDevnet;
const RPC = chain.rpcUrls.default.http[0];
const WAIT = { interval: 5_000, retries: 30 };
const FUND_WEI = BigInt(5) * BigInt(10) ** BigInt(18);

const gen = (wei) => `${Number(wei) / 1e18} GEN`;
const since = (mark) => `${((Date.now() - mark) / 1000).toFixed(1)}s`;

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const balance = async (address) => BigInt(await rpc("eth_getBalance", [address, "latest"]));

function reportContractError(receipt) {
  const seen = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "stderr" && typeof value === "string" && value.trim() && !seen.has(value)) {
        seen.add(value);
        console.error(value.slice(-1500));
      } else {
        walk(value);
      }
    }
  };
  walk(receipt);
}

const account = createAccount(generatePrivateKey());
const client = createClient({ chain, account });
console.log("wallet", account.address);

await rpc("sim_fundAccount", [account.address, FUND_WEI.toString()]);
for (let attempt = 0; attempt < 20 && (await balance(account.address)) === BigInt(0); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
const funded = await balance(account.address);
console.log("funded", gen(funded));

const code = new Uint8Array(readFileSync("contracts/court.py"));
let mark = Date.now();
const deployFees = await client.estimateTransactionFees();
console.log("deploy budget", gen(deployFees.feeValue));
const deployHash = await client.deployContract({
  code,
  args: [account.address],
  fees: { distribution: deployFees.distribution, feeValue: deployFees.feeValue },
});
const deployReceipt = await client.waitForFinalization({ hash: deployHash, ...WAIT });
if (!isSuccessful(deployReceipt)) {
  console.error("deploy failed", since(mark));
  reportContractError(deployReceipt);
  process.exit(1);
}
const address = deployReceipt.txDataDecoded?.contractAddress ?? deployReceipt.data?.contract_address;
const afterDeploy = await balance(account.address);
console.log("deployed", address, since(mark), "cost", gen(funded - afterDeploy));

const write = {
  address,
  functionName: "judge",
  args: [
    "cas_smoke",
    "Save money, except being late for work or losing a client.",
    JSON.stringify({ kind: "book", summary: "Business class, EUR 420", amount: 420, currency: "EUR" }),
    JSON.stringify({
      justification: "Economy is enough for this trip.",
      counter_action: { kind: "book", summary: "Economy, EUR 180", amount: 180, currency: "EUR" },
    }),
    JSON.stringify([{ type: "text", value: "Presentation at 9:00 the next morning" }]),
    "",
    "",
  ],
};
mark = Date.now();
const judgeFees = await client.estimateTransactionFeesForWrite(write);
console.log("judge budget", gen(judgeFees.feeValue));
const judgeHash = await client.writeContract({
  ...write,
  fees: { distribution: judgeFees.distribution, feeValue: judgeFees.feeValue },
});
const judgeReceipt = await client.waitForFinalization({ hash: judgeHash, ...WAIT });
if (!isSuccessful(judgeReceipt)) {
  console.error("judge failed", since(mark));
  reportContractError(judgeReceipt);
  process.exit(1);
}
console.log("judged", since(mark), judgeHash, "cost", gen(afterDeploy - (await balance(account.address))));
console.log("verdict", await client.readContract({ address, functionName: "get_verdict", args: ["cas_smoke"] }));
