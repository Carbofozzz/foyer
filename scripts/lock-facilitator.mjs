#!/usr/bin/env node
/**
 * Grant-gated x402 facilitator. Refuses unless Foyer already consumed a
 * pay.x402 grant for this url, amount, and asset. Then forwards the signed
 * payment to an x402 settle rail and fetches the paid resource.
 */
import { createServer } from "node:http";

const foyer = (process.env.FOYER_URL || "https://foyerapp.dev").replace(/\/$/, "");
const port = Number(process.env.FOYER_X402_FACILITATOR_PORT || 8787);
const settleOrigin = (process.env.FOYER_X402_SETTLE_URL || "https://x402.org/facilitator").replace(/\/$/, "");

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function introspect(grant, invocationId) {
  const response = await fetch(`${foyer}/api/grants/introspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant, invocation_id: invocationId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `introspect failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body.data;
}

function refusal(info, request) {
  if (!info || info.hand !== "pay.x402") return "hand";
  if (info.status !== "consumed") return "status";
  const args = info.invocation?.args;
  if (!args) return "invocation";
  if (hostOf(args.url) !== hostOf(request.url) && args.host !== hostOf(request.url)) return "host";
  if (Number(args.amount) !== Number(request.amount)) return "amount";
  if (args.asset !== request.asset) return "asset";
  const hosts = Array.isArray(info.constraints?.hosts) ? info.constraints.hosts : [];
  const host = hostOf(request.url);
  if (!host || !hosts.includes(host)) return "host";
  if (Number(request.amount) > Number(info.constraints.max_per_req)) return "amount";
  if (request.asset !== info.constraints.asset) return "asset";
  return null;
}

function encodePayment(payment) {
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

async function settleOnRail(payment, requirements) {
  const response = await fetch(`${settleOrigin}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      x402Version: payment.x402Version || 1,
      paymentPayload: payment,
      paymentRequirements: {
        scheme: requirements.scheme || "exact",
        network: requirements.network,
        maxAmountRequired: requirements.amount,
        amount: requirements.amount,
        resource: requirements.resourceUrl || requirements.resource,
        payTo: requirements.payTo,
        maxTimeoutSeconds: requirements.maxTimeoutSeconds,
        asset: requirements.asset,
        extra: requirements.extra,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.errorReason || `x402 settle refused (${response.status})`);
  }
  return body;
}

async function fetchPaid(url, payment) {
  const encoded = encodePayment(payment);
  const version = Number(payment.x402Version || 1);
  const headers = { accept: "application/json, */*" };
  if (version >= 2) headers["PAYMENT-SIGNATURE"] = encoded;
  else headers["X-PAYMENT"] = encoded;
  const response = await fetch(url, { method: "GET", headers });
  const body = await response.text();
  return { status: response.status, body };
}

async function settle(body) {
  const grant = typeof body.grant === "string" ? body.grant : "";
  const invocationId = typeof body.invocation_id === "string" ? body.invocation_id : "";
  const url = typeof body.url === "string" ? body.url : "";
  const asset = typeof body.asset === "string" ? body.asset : "";
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const payment = body.payment && typeof body.payment === "object" ? body.payment : null;
  const requirements = body.requirements && typeof body.requirements === "object" ? body.requirements : null;
  if (!grant || !invocationId || !url || !asset || !Number.isFinite(amount) || !payment || !requirements) {
    return {
      status: 400,
      body: {
        error: {
          code: "bad_request",
          message: "grant, invocation_id, url, amount, asset, payment, requirements required",
        },
      },
    };
  }
  const info = await introspect(grant, invocationId);
  const why = refusal(info, { url, amount, asset });
  if (why) {
    return { status: 409, body: { error: { code: "grant_rejected", message: `Facilitator refused: ${why}` } } };
  }
  const rail = await settleOnRail(payment, requirements);
  const paid = await fetchPaid(requirements.resourceUrl || url, payment);
  return {
    status: 200,
    body: {
      data: {
        settled: true,
        grant_id: info.grant_id,
        invocation_id: invocationId,
        transaction: rail.transaction || rail.txHash || rail.data?.transaction || null,
        network: requirements.network,
        resource_status: paid.status,
        resource: paid.body,
      },
    },
  };
}

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/settle") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "not_found", message: "POST /settle" } }));
    return;
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    void (async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const result = await settle(body);
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(JSON.stringify(result.body));
      } catch (error) {
        const status = error && typeof error.status === "number" ? error.status : 502;
        res.writeHead(status, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "facilitator", message: error instanceof Error ? error.message : "settle failed" },
          }),
        );
      }
    })();
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stderr.write(`foyer-lock facilitator on 127.0.0.1:${port} → ${settleOrigin}\n`);
});
