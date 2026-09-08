# Demo script

A pass is permission — the assistant acts. Speak for about eight minutes. The product is the **cabinet**, not the landing harness.

Public URL: **https://foyerapp.dev**. Local stand-in: `http://127.0.0.1:3001`. Smoke the same paths with `FOYER_URL=https://foyerapp.dev npm run demo`.

## 1. Person with one chat agent (~5 min)

1. Open `/{locale}` → **Sign in with your wallet**. One wallet is one house.
2. Wizard: rules → lock kinds → paste the MCP block ([Connect](CONNECT.md)). A checker is a **hook**, not a second chat. A real guardian is a connected assistant.
3. Point at the feed: propose, objections (all of them), bargain (withdraw / revise / insist). Court only after insist: yes, no, or you. After a final answer the assistant acks with `report` — Foyer did not pay or book.
4. Open **HTTP / OpenAPI** under Connect. Same key. Optional: `npm run http:client`.

The cabinet **test** tab walks the same loop: propose, collect timer, object, then revise / withdraw / insist. Buttons on each assistant show the raw API JSON that agent would get.

## 2. Extra if there is no runtime (~2 min)

1. Landing **Open a demo** — one shared cabinet, feed and rules only. Not the product house.
2. Or `/{locale}/cabinet/demo`: the same tabs as a live cabinet (no test tab), mock data, buttons do nothing. Six stories: two objections then deny, revise without court, a block, insist-allow, silence-allow, escalate.

## 3. Checklist

Checklist from [INITIAL.md](INITIAL.md) (cabinet + protocol as shipped):

| Check | Where |
|---|---|
| Connect without OpenAPI | Cabinet MCP + [CONNECT.md](CONNECT.md) |
| Hook checker, not a second chat | Connect; silence among chats is consent |
| Agent calls, not UI clicks | Feed rows come from `propose` / `object` / bargain |
| Yes / no / human, never a court-picked booking | Demo cabinet feed |
| Several objections on one action | Demo case A |
| Untouched action still closes | `sweep()` on cron `GET`/`POST /tick` and on every read; `GET /api/health` |
| Pass + report + appeal | After a final answer the agent acks with `report`; a miss notifies the owner; cabinet appeal is yes/no |
| On-chain tx | Live cabinet when the GenLayer tx finalizes |
| Demo ≠ product | Landing demo card; shared `/cabinet/demo` |
| State after reload | Neon, not process memory |
| Other houses stay dark | Agent key or the owner’s wallet session |

## 4. Org path (if asked)

Same wallet login. Wizard type **company**. Invite a 0x address. Do not invent a second password. Issue keys from Connect.
