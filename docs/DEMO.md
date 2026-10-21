# Demo script

Index: [README](../README.md). A pass is permission — the assistant acts. Speak for about eight minutes. The product is the **cabinet**, not the landing harness.

Public URL: **https://foyerapp.dev**. Local stand-in: `http://127.0.0.1:3001`. Smoke the same paths with `FOYER_URL=https://foyerapp.dev npm run demo`.

## 1. Person with one chat agent (~5 min)

1. Open `/{locale}` → **Sign in with your wallet**. One wallet is one house.
2. Setup modal: rules → optional assistant → top up (wallet or Studio faucet) → email. Reopen from the cabinet header. A checker is a **hook**, not a second chat. A real guardian is a connected assistant.
3. Point at the feed: propose, objections (all of them), bargain (withdraw / revise / insist). Court only after insist: yes, no, or you. After a final answer the assistant acks with `report` — Foyer did not pay or book.
4. Open **HTTP / OpenAPI** under Connect. Same key. Optional: `npm run http:client`.

The cabinet **test** tab walks the same loop: propose, collect timer, object, then revise / withdraw / insist. Buttons on each assistant show the raw API JSON that agent would get.

## 2. Checklist

Checklist from [INITIAL.md](INITIAL.md) (cabinet + protocol as shipped):

| Check | Where |
|---|---|
| Connect without OpenAPI | Cabinet MCP + [CONNECT.md](CONNECT.md) |
| Hook checker, not a second chat | Connect; silence among chats is consent |
| Agent calls, not UI clicks | Feed rows come from `propose` / `object` / bargain |
| Yes / no / human, never a court-picked booking | Live cabinet feed |
| Several objections on one action | Live cabinet feed |
| Untouched action still closes | `sweep()` on cron `GET`/`POST /tick` and on every read; `GET /api/health` |
| Pass + report + appeal | After a final answer the agent acks with `report`; a miss notifies the owner; cabinet appeal is yes/no |
| On-chain tx | Live cabinet when the GenLayer tx finalizes |
| State after reload | Neon, not process memory |
| Other houses stay dark | Agent key or the owner’s wallet session |

## 3. Org path (if asked)

Same wallet login. Wizard type **company**. Invite a 0x address. Do not invent a second password. Issue keys from Connect.
