#!/usr/bin/env node
/** External HTTP client: constitution → inbox → optional propose. Same protocol as MCP. */

const origin = (process.env.FOYER_URL ?? "").replace(/\/$/, "");
const key = process.env.FOYER_AGENT_KEY ?? "";

if (!origin || !key.startsWith("agk_")) {
  console.error("Set FOYER_URL and FOYER_AGENT_KEY (agk_…).");
  process.exit(1);
}

async function call(path, opts = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  if (!response.ok) {
    console.error(path, response.status, payload);
    process.exit(1);
  }
  return payload;
}

const constitution = await call("/api/constitution");
console.log("constitution", constitution.data?.constitution?.slice(0, 120) ?? constitution);

const inbox = await call("/api/inbox");
console.log("inbox", inbox.data?.items?.length ?? 0, "items");

if (process.argv.includes("--propose")) {
  const action = await call("/api/actions", {
    method: "POST",
    body: {
      kind: "book",
      payload: { kind: "book", summary: "HTTP client probe, €10", amount: 10, currency: "EUR" },
      justification: "External HTTP client completing the loop.",
      evidence: [{ type: "text", value: "scripts/http-client.mjs" }],
    },
  });
  console.log("proposed", action.data?.id ?? action);
}
