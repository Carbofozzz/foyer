# Demo script

Startup-ready freeze (day 14), plus depth: a pass is permission — the assistant acts. Speak for about eight minutes. The product is the **cabinet**, not the landing harness.

Public URL: **https://foyerapp.dev**. Local stand-in: `http://127.0.0.1:3001`. Smoke the same paths with `FOYER_URL=https://foyerapp.dev npm run demo`.

## 1. Person with one chat agent (~5 min)

1. Open `/{locale}` → **Sign in with your wallet**. One wallet is one house.
2. Wizard: rules → lock kinds → paste the MCP block ([Connect](CONNECT.md)) → start the **test** clients → first pass. Say out loud: these clients match canned phrases; a real guardian is a second connected assistant.
3. Point at the feed: a propose, a test-client object, a verdict. After a pass the test client reports that it acted — Foyer did not pay or book. No “I am Budget” click.
4. Open **HTTP / OpenAPI** in the same cabinet. Same key. Optional: `npm run http:client`.

## 2. Extra if there is no runtime (~2 min)

1. Landing **Open a demo** — one shared cabinet, feed and rules only. Not the product house.
2. Or `/{locale}/cabinet/demo`: the same tabs as a live cabinet, mock data, buttons do nothing.

## 3. Checklist

§9 of [HACKATHON.md](HACKATHON.md) stays green:

| §9 | Where |
|---|---|
| Connect without OpenAPI | Cabinet MCP + [CONNECT.md](CONNECT.md) |
| Test-client dispute | Wizard “start the test clients”, then first pass. Real guardian = second connected assistant |
| Agent calls, not UI clicks | Feed rows come from `propose` / `object` |
| Four outcomes, both `allow_b` readings | Demo cabinet feed; live first pass hits B/C or D |
| `remedy` names `remedy_action`; agent acts | Demo feed; inbox `may_act` + `report` |
| Untouched action still closes | `sweep()` on cron `POST /tick` and on every read; `GET /api/health` |
| Pass + report + appeal | After a pass the test client reports; cabinet appeal; `spend` waits for the appeal window |
| On-chain tx | Live cabinet when the GenLayer tx finalizes |
| Demo ≠ product | Landing demo card; shared `/cabinet/demo` |
| State after reload | Neon, not process memory |
| Other houses stay dark | Agent key or the owner’s wallet session |

## 4. Org path (if asked)

Same wallet login. Wizard type **company**. Invite a 0x address. Do not invent a second password. Sales / Legal / Finance keys from Connect.
