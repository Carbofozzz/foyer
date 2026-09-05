# Demo script

Startup-ready freeze (day 14). Speak for about eight minutes. The product is the **cabinet**, not the landing harness.

Public URL: **https://foyerapp.dev**. Local stand-in: `http://127.0.0.1:3001`. Smoke the same paths with `FOYER_URL=https://foyerapp.dev npm run demo`.

## 1. Person with one chat agent (~5 min)

1. Open `/{locale}` → **Sign in with your wallet**. One wallet is one house.
2. Wizard: rules → lock kinds → paste the MCP block ([Connect](CONNECT.md)) → enable the guardian → first pass.
3. Point at the feed: a propose, a guardian object, a verdict. No “I am Budget” click.
4. Open **HTTP / OpenAPI** in the same cabinet. Same key. Optional: `npm run http:client`.

## 2. Extra if there is no runtime (~2 min)

1. Landing **Start the harness** — say it is throwaway, not the product.
2. Or `/{locale}/replay`: cases A–F cover `remedy`, `allow_b` (counter and block), `allow_a` (silence), `escalate`.

## 3. Checklist

Walk `/{locale}/check`. §9 of [HACKATHON.md](HACKATHON.md) stays green:

| §9 | Where |
|---|---|
| Connect without OpenAPI | Cabinet MCP tabs + `/connect` |
| Guardian dispute | Wizard “enable guardian”, then first pass |
| Agent calls, not UI clicks | Feed rows come from `propose` / `object` |
| Four outcomes, both `allow_b` readings | Replay A–F; live first pass hits B/C or D |
| `remedy` executes `remedy_action` | Replay A; gateway `execute` |
| Untouched action still closes | `sweep()` on cron `POST /tick` and on every read; `/{locale}/status` |
| Execute + appeal | Cabinet appeal on a judged row; `spend` waits for the appeal window |
| On-chain tx | Live cabinet when consensus lands; optional `NEXT_PUBLIC_REPLAY_TX` |
| Harness ≠ product | Landing kicker “Harness”; spawn banner |
| State after reload | Neon, not process memory |
| Other houses stay dark | Agent key or the owner’s wallet session |

## 4. Org path (if asked)

Same wallet login. Wizard type **company**. Invite a 0x address. Do not invent a second password. Sales / Legal / Finance keys from Connect.
