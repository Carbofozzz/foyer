// Smoke deploy only. Product path: one IC per house, signed by that house wallet.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, isSuccessful } from "genlayer-js";
import { studioDevnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const CHAINS = {
  studiodevnet: studioDevnet,
  studionetdev: studioDevnet,
  "studio-dev": studioDevnet,
  studionet,
  testnetasimov: testnetAsimov,
  testnetbradbury: testnetBradbury,
};

loadDotEnv(resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local"));

const keyRaw = process.env.GENLAYER_PRIVATE_KEY?.trim();
if (!keyRaw) {
  console.error("Set GENLAYER_PRIVATE_KEY (smoke only; houses use their own wallet)");
  process.exit(1);
}

const chainKey = (process.env.GENLAYER_CHAIN ?? "studioDevnet").trim().toLowerCase();
const chain = CHAINS[chainKey.replace(/_/g, "-")] ?? CHAINS[chainKey.replace(/-/g, "")];
if (!chain) {
  console.error("Unknown GENLAYER_CHAIN. Use studioDevnet, studionetdev, studionet, testnetBradbury, or testnetAsimov.");
  process.exit(1);
}

const accountKey = /** @type {`0x${string}`} */ (keyRaw.startsWith("0x") ? keyRaw : `0x${keyRaw}`);
const code = new Uint8Array(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../contracts/court.py")));
const account = createAccount(accountKey);
const client = createClient({ chain, account });

const estimate = await client.estimateTransactionFees();
const hash = await client.deployContract({
  code,
  args: [account.address],
  fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
});
const receipt = await client.waitForFinalization({
  hash,
  retries: 200,
  interval: 5000,
});

if (!isSuccessful(receipt)) {
  console.error("Deploy did not succeed", receipt.statusName);
  process.exit(1);
}

const decoded = receipt.txDataDecoded && typeof receipt.txDataDecoded === "object" ? receipt.txDataDecoded : null;
const fromDecoded =
  decoded && "contractAddress" in decoded && typeof decoded.contractAddress === "string"
    ? decoded.contractAddress
    : null;
const fromData =
  receipt.data && typeof receipt.data === "object" && "contract_address" in receipt.data
    ? String(receipt.data.contract_address)
    : null;
const address = fromDecoded ?? fromData;
if (!address) {
  console.error("Deploy receipt has no contract address");
  process.exit(1);
}

console.log(address);

function loadDotEnv(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}
