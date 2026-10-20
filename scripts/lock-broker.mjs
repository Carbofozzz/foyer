#!/usr/bin/env node
/**
 * Local PEP for git.push and pay.x402.
 * Refuses before any side effect when Foyer consume fails.
 * Does not store the secret in Foyer. Cursor's own terminal is a separate door.
 */
import { createPrivateKey, sign } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { challengeRefusal, hasPayerKey, payX402, probe402 } from "./lock-x402.mjs";
import { ap2Key } from "./lock-secret.mjs";

const origin = (process.env.FOYER_URL || "https://foyerapp.dev").replace(/\/$/, "");
const agentKey = process.env.FOYER_AGENT_KEY || "";

const TOOL_HAND = { git_push: "git.push", pay_x402: "pay.x402", sign_ap2: "pay.ap2" };

function handsAllowed() {
  if (process.env.FOYER_LOCK_HANDS == null) return null;
  return new Set(
    process.env.FOYER_LOCK_HANDS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const tools = [
  {
    name: "git_push",
    description:
      "Push one ref. Runs only after Foyer consumes a git.push grant. Does not read instructions from the payload.",
    inputSchema: {
      type: "object",
      required: ["grant", "repo", "ref"],
      properties: {
        grant: { type: "string" },
        repo: { type: "string" },
        ref: { type: "string" },
        commit_sha: { type: "string" },
        invocation_id: { type: "string" },
      },
    },
  },
  {
    name: "pay_x402",
    description:
      "Pay one x402 HTTP 402. Runs only after Foyer consumes a pay.x402 grant. Signs EIP-3009 on this machine. Host, amount, and asset must match the grant and the 402 challenge.",
    inputSchema: {
      type: "object",
      required: ["grant", "url", "amount", "asset"],
      properties: {
        grant: { type: "string" },
        url: { type: "string" },
        amount: { type: "number" },
        asset: { type: "string" },
        invocation_id: { type: "string" },
        model: { type: "string" },
        provider: { type: "string" },
      },
    },
  },
  {
    name: "sign_ap2",
    description:
      "Sign a checkout mandate on this machine. Runs only after Foyer consumes a pay.ap2 grant for the same checkout hash, amount, and asset. No card number is sent to Foyer.",
    inputSchema: {
      type: "object",
      required: ["grant", "checkout_hash", "amount", "asset"],
      properties: {
        grant: { type: "string" },
        checkout_hash: { type: "string" },
        amount: { type: "number" },
        asset: { type: "string" },
        invocation_id: { type: "string" },
      },
    },
  },
];

async function consume(grant, args, invocationId, model, provider) {
  if (!agentKey) throw new Error("FOYER_AGENT_KEY is not set");
  const response = await fetch(`${origin}/api/grants/consume`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${agentKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      grant,
      invocation_id: invocationId,
      args,
      model: model || "",
      provider: provider || "",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `consume failed (${response.status})`;
    throw new Error(message);
  }
  return body.data;
}

function runGit(repo, ref) {
  return new Promise((resolve, reject) => {
    const cwd = process.env.FOYER_LOCK_GIT_CWD || process.cwd();
    const child = spawn("git", ["push", repo, ref], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ ran: "git.push" });
      else reject(new Error(stderr.trim() || `git push exited ${code}`));
    });
  });
}

function headSha() {
  const cwd = process.env.FOYER_LOCK_GIT_CWD || process.cwd();
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || "git rev-parse failed").trim());
  return result.stdout.trim();
}

async function runX402(grant, invocationId, call, required) {
  return payX402({ grant, invocationId, call, required });
}

function listedTools() {
  const allowed = handsAllowed();
  if (!allowed) return tools;
  return tools.filter((tool) => allowed.has(TOOL_HAND[tool.name]));
}

async function callTool(name, args) {
  const allowed = handsAllowed();
  const hand = TOOL_HAND[name];
  if (allowed && hand && !allowed.has(hand)) throw new Error("This connection does not include that action");
  const invocationId = typeof args.invocation_id === "string" && args.invocation_id ? args.invocation_id : `inv_${Date.now()}`;
  if (name === "git_push") {
    const call = { repo: args.repo, ref: args.ref };
    if (args.commit_sha) {
      const head = headSha();
      if (head !== args.commit_sha) throw new Error("HEAD does not match commit_sha");
      call.commit_sha = args.commit_sha;
    }
    await consume(String(args.grant || ""), call, invocationId, args.model, args.provider);
    if (process.env.FOYER_LOCK_DRY === "1") return { ok: true, dry: true, would: "git.push", invocation_id: invocationId };
    await runGit(String(args.repo), String(args.ref));
    return { ok: true, ran: "git.push", invocation_id: invocationId };
  }
  if (name === "pay_x402") {
    const call = { url: args.url, amount: args.amount, asset: args.asset };
    let required = null;
    if (process.env.FOYER_LOCK_DRY !== "1") {
      if (!hasPayerKey()) throw new Error("Payer key is not in the OS keychain (foyer.lock / pay.x402)");
      const probe = await probe402(String(call.url));
      const why = challengeRefusal(call, probe.required);
      if (why) throw new Error(`Payment does not match the grant: ${why}`);
      required = probe.required;
    }
    await consume(String(args.grant || ""), call, invocationId, args.model, args.provider);
    if (process.env.FOYER_LOCK_DRY === "1") return { ok: true, dry: true, would: "pay.x402", invocation_id: invocationId };
    const result = await runX402(String(args.grant || ""), invocationId, call, required);
    return { ok: true, ...result, invocation_id: invocationId };
  }
  if (name === "sign_ap2") {
    ap2Key();
    const call = { checkout_hash: args.checkout_hash, amount: args.amount, asset: args.asset };
    await consume(String(args.grant || ""), call, invocationId, args.model, args.provider);
    if (process.env.FOYER_LOCK_DRY === "1") return { ok: true, dry: true, would: "pay.ap2", invocation_id: invocationId };
    return { ok: true, ran: "pay.ap2", invocation_id: invocationId, mandate: signMandate(call) };
  }
  if (name === "shell" || name === "bash") {
    throw new Error("This process has no shell tool");
  }
  throw new Error(`Unknown tool: ${name}`);
}

function signMandate(call) {
  const seed = Buffer.from(ap2Key(), "base64url");
  if (seed.length !== 32) throw new Error("FOYER_AP2_SIGNING_KEY must be 32 bytes, base64url");
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
  const issuedAt = Math.floor(Date.now() / 1000);
  const mandate = {
    protocol: "ap2",
    type: "PaymentMandate",
    checkout_hash: call.checkout_hash,
    amount: call.amount,
    asset: call.asset,
    issued_at: issuedAt,
    exp: issuedAt + 900,
    surface: "foyer-lock",
  };
  const payload = Buffer.from(JSON.stringify(mandate));
  return { ...mandate, sig: sign(null, payload, privateKey).toString("base64url") };
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function fail(id, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`);
}

if (process.argv.includes("--http")) {
  const port = Number(process.env.FOYER_LOCK_HTTP_PORT || 8788);
  createServer((req, res) => {
    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (req.method === "GET" && req.url === "/tools") {
      send(200, { tools: listedTools() });
      return;
    }
    if (req.method !== "POST" || req.url !== "/call") {
      send(404, { error: { message: "Not found" } });
      return;
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      void (async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
          const data = await callTool(body.name, body.arguments || body.args || {});
          send(200, { data });
        } catch (error) {
          send(400, { error: { message: error instanceof Error ? error.message : "lock broker failed" } });
        }
      })();
    });
  }).listen(port, "127.0.0.1");
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const id = msg.id ?? null;
  const method = msg.method || "";
  void (async () => {
    try {
      if (method === "initialize") {
        reply(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: process.env.FOYER_LOCK_HOST === "1" ? "foyer-lock-host" : "foyer-lock", version: "0.1.0" },
        });
        return;
      }
      if (method === "tools/list") {
        reply(id, { tools: listedTools() });
        return;
      }
      if (method === "tools/call") {
        const params = msg.params || {};
        const data = await callTool(params.name, params.arguments || {});
        reply(id, { content: [{ type: "text", text: JSON.stringify(data) }] });
        return;
      }
      reply(id, {});
    } catch (error) {
      fail(id, error instanceof Error ? error.message : "lock broker failed");
    }
  })();
});
