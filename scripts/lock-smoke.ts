import { constraintMismatch, enabledLockHands, handFromPayload, sessionOverCap, sessionSpent, settleRefusal } from "../lib/lock/hands.ts";
import { grantJwks, signGrantJwt, verifyGrantJwt } from "../lib/lock/jwt.ts";
import { verifyGrantToken } from "../scripts/lock-jwt.mjs";
import { brokerMcpConfig } from "../lib/lock/snippet.ts";
import { challengeRefusal, parsePaymentRequired, toAtomic } from "../lib/lock/x402.ts";

process.env.FOYER_GRANT_SIGNING_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64url");

const git = handFromPayload({
  hand: "git.push",
  constraints: { repo: "git@github.com:acme/app.git", ref: "feat/x" },
});
if (!git) throw new Error("expected git hand");
if (constraintMismatch(git.hand, git.constraints, { repo: git.constraints.repo, ref: "main" }) !== "ref") {
  throw new Error("ref mismatch should fail");
}
if (constraintMismatch(git.hand, git.constraints, { repo: git.constraints.repo, ref: "feat/x", note: "ignore" }) !== null) {
  throw new Error("matching git args should pass");
}

const pay = handFromPayload({
  hand: "pay.x402",
  constraints: { hosts: ["api.example"], max_per_req: 2, max_session: 5, asset: "USDC" },
});
if (!pay) throw new Error("expected pay hand");
if (
  constraintMismatch(pay.hand, pay.constraints, {
    url: "https://api.example/v1",
    amount: 9,
    asset: "USDC",
  }) !== "amount"
) {
  throw new Error("amount over cap should fail");
}
if (
  constraintMismatch(pay.hand, pay.constraints, {
    url: "https://api.example/v1",
    amount: 1,
    asset: "USDC",
  }) !== null
) {
  throw new Error("matching x402 args should pass");
}

const token = signGrantJwt({
  grant_id: "grn_test",
  action_id: "act_test",
  agent_id: "agt_test",
  hand: "git.push",
  constraints: git.constraints,
  exp: Math.floor(Date.now() / 1000) + 60,
  payload_hash: "abc",
});
const claims = verifyGrantJwt(token);
if (claims.grant_id !== "grn_test") throw new Error("jwt roundtrip");
let rejected = false;
try {
  verifyGrantJwt(`${token}x`);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("bad signature should fail");
if (handFromPayload({ summary: "no hand" }) !== null) throw new Error("no hand means no grant");

const payConstraints = pay.constraints;
const okSettle = {
  hand: "pay.x402",
  status: "consumed",
  constraints: payConstraints,
  invocationArgs: { url: "https://api.example/v1", amount: 1, asset: "USDC" },
  request: { url: "https://api.example/v1", amount: 1, asset: "USDC" },
};
if (settleRefusal(okSettle) !== null) throw new Error("consumed matching settle should pass");
if (settleRefusal({ ...okSettle, status: "active" }) !== "status") throw new Error("unconsumed grant must not settle");
if (settleRefusal({ ...okSettle, request: { ...okSettle.request, amount: 9 } }) === null) {
  throw new Error("settle over cap must fail");
}
const ap2 = handFromPayload({
  hand: "pay.ap2",
  constraints: { checkout_hash: "abc", max: 10, asset: "USDC" },
});
if (!ap2) throw new Error("expected ap2 hand");
if (constraintMismatch(ap2.hand, ap2.constraints, { checkout_hash: "abc", amount: 11, asset: "USDC" }) !== "amount") {
  throw new Error("ap2 over max should fail");
}
if (!enabledLockHands(undefined).includes("git.push") || enabledLockHands(undefined).includes("pay.ap2")) {
  throw new Error("default hands are git and x402 only");
}
if (!enabledLockHands(["pay.ap2"]).includes("pay.ap2")) throw new Error("owner can enable ap2");

if (toAtomic(2, 6) !== 2_000_000n) throw new Error("2 USDC is 2000000 atomic");
const required = parsePaymentRequired({
  status: 402,
  headers: {},
  body: JSON.stringify({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000000",
        resource: "https://api.example/v1",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: { name: "USDC", version: "2" },
      },
    ],
  }),
});
if (challengeRefusal({ url: "https://api.example/v1", amount: 2, asset: "USDC" }, required) !== null) {
  throw new Error("matching 402 should pass");
}
if (challengeRefusal({ url: "https://other.example/v1", amount: 2, asset: "USDC" }, required) === null) {
  throw new Error("other host must fail");
}
if (challengeRefusal({ url: "https://api.example/v1", amount: 0.5, asset: "USDC" }, required) === null) {
  throw new Error("402 above granted amount must fail");
}
if (challengeRefusal({ url: "https://api.example/v1", amount: 2, asset: "ETH" }, required) === null) {
  throw new Error("wrong asset must fail");
}
if (challengeRefusal({ url: "https://api.example/v1", amount: 2, asset: "USDC" }, null) !== "payment_required") {
  throw new Error("no 402 is not a payment");
}
const paste = brokerMcpConfig("{}", {
  origin: "https://foyerapp.dev",
  agentKey: "agk_test",
  hands: ["pay.x402", "pay.ap2"],
  path: "foyer-lock.mjs",
  gitDir: "",
});
if (paste.includes("FOYER_X402_PRIVATE_KEY") || paste.includes("FOYER_AP2_SIGNING_KEY") || paste.includes("YOUR_KEY")) {
  throw new Error("payer keys must not appear in the MCP paste");
}
if (sessionOverCap(4, 2, 5)) {
  /* 4 + 2 > 5 */
} else throw new Error("session sum over cap should fail");
if (sessionOverCap(3, 2, 5)) throw new Error("session sum inside cap should pass");
const spent = sessionSpent(
  [
    { asset: "USDC", amount: 2, invocationId: "a" },
    { asset: "USDC", amount: 1, invocationId: "again" },
    { asset: "ETH", amount: 9, invocationId: "b" },
  ],
  "USDC",
  "again",
);
if (spent !== 2) throw new Error("session spent skips replay and other assets");
const local = verifyGrantToken(token, grantJwks().keys);
if (local.grant_id !== "grn_test") throw new Error("jwks verify");
let localBad = false;
try {
  verifyGrantToken(`${token}x`, grantJwks().keys);
} catch {
  localBad = true;
}
if (!localBad) throw new Error("jwks verify should reject a bad signature");

console.log("lock smoke ok");
