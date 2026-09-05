#!/usr/bin/env node
/** Day-14 smoke: health + public pages. Does not spawn (that is the harness). */

const origin = (process.env.FOYER_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");

async function get(path) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual" });
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

const pages = ["/en", "/en/check", "/en/replay", "/en/connect", "/en/status", "/en/legal", "/en/privacy", "/api/openapi"];
for (const path of pages) {
  const page = await get(path);
  if (path === "/en/replay") {
    for (const id of ["Case A", "Case E", "Case F"]) {
      if (!page.text.includes(id)) throw new Error(`/en/replay missing ${id}`);
    }
  }
  if (path === "/api/openapi") {
    const spec = JSON.parse(page.text);
    if (spec.info?.title !== "Foyer") throw new Error("OpenAPI is not this Foyer");
  }
  console.log("ok", path, page.status);
}

console.log("health", body.env, "db", body.db, "tick", body.tick?.at ?? "none");
console.log("demo script: docs/DEMO.md");
console.log("origin", origin);
