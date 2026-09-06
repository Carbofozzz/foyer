#!/usr/bin/env node
/** Day-14 smoke: health + public pages. Does not spawn (that is the harness). */

const origin = (process.env.FOYER_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");

async function get(path) {
  const response = await fetch(`${origin}${path}`, { redirect: "follow" });
  const text = await response.text();
  if (response.status >= 400) {
    throw new Error(`${path} → ${response.status}`);
  }
  return { status: response.status, text };
}

const health = await get("/api/health");
let body;
try {
  body = JSON.parse(health.text);
} catch {
  throw new Error("/api/health is not JSON — is FOYER_URL this repo?");
}
if (body.ok !== true) throw new Error(`/api/health not ok: ${health.text.slice(0, 200)}`);

const pages = ["/en", "/en/cabinet/demo", "/en/legal", "/en/privacy", "/api/openapi"];
for (const path of pages) {
  const page = await get(path);
  if (path === "/en/cabinet/demo") {
    for (const label of ["Activity", "Treasury", "Rules", "Then a transaction."]) {
      if (!page.text.includes(label)) throw new Error(`/en/cabinet/demo missing ${label}`);
    }
    if (page.text.includes("Carried out")) {
      throw new Error("/en/cabinet/demo still says Foyer carried it out");
    }
  }
  if (path === "/api/openapi") {
    const spec = JSON.parse(page.text);
    if (spec.info?.title !== "Foyer") throw new Error("OpenAPI is not this Foyer");
    if (!spec.paths?.["/api/actions/{id}/report"]) {
      throw new Error("OpenAPI missing POST /api/actions/{id}/report");
    }
    const action = spec.components?.schemas?.Action?.properties ?? {};
    if (!action.may_act) throw new Error("OpenAPI Action missing may_act");
    if (action.charged || action.spend_receipt) {
      throw new Error("OpenAPI Action still looks like a treasury debit");
    }
    const payload = spec.components?.schemas?.ActionPayload?.description ?? "";
    if (/gateway would execute/i.test(payload)) {
      throw new Error("OpenAPI ActionPayload still says the gateway executes");
    }
  }
  console.log("ok", path, page.status);
}

console.log("health", body.env, "db", body.db, "tick", body.tick?.at ?? "none");
console.log("demo script: docs/DEMO.md");
console.log("origin", origin);
