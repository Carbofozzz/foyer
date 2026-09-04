# AGENTS.md

Working instructions for coding agents in this repository.

Canonical product plan: [`docs/HACKATHON.md`](docs/HACKATHON.md). If this file and the plan disagree, follow the codebase, then update the docs in the same change.

Private notes (pitch, discussion dumps) live in `.local/` and are gitignored. Do not copy them into tracked docs.

## Product

Foyer is an **intra-principal** court and gateway: agents of one person or company share a wallet, calendar, and name, but not a goal. Track: **Onchain Justice**. Not escrow with a stranger. Not DAO governance.

Three parts: **constitution** (plain language) → **gateway** (only exit to the world) → **court** (GenLayer reads constitution + evidence).

The lock is **tools and keys**, not a prompt. An agent has no direct `stripe` / `calendar` tools. After a verdict the gateway calls adapters.

## Invariants

- The gateway client is always an agent. The UI must not create a case around the API, and the gateway must never write an objection on an agent's behalf.
- Court outcomes: `allow_a` | `allow_b` | `remedy` | `escalate`. No fifth outcome. `allow_b` executes the objector's `counter_action`, or nothing when the objection was a pure block.
- `remedy` always carries an executable `remedy_action`. If the compromise cannot be written as an action, the outcome is `escalate`.
- A verdict also answers `objection_grounded`. That flag, and nothing else, burns the bond.
- Silence in the window = consent (allow without court). Ack is owed only by engaged parties — the proposer and the objectors.
- **No daemons.** Time advances in `sweep(principal, now)`, called by the cron route `POST /tick` and by every protocol read. It must be idempotent.
- Every agent call carries an agent key, and the key names the house — that is why routes have no principal id. The principal uses a cabinet link (accounts from day 8).
- **Guardian** stays in the house after onboarding and is woken by the tick with its own key. **Spawn** is a temporary harness for guests with no runtime. Do not mix them.
- Hackathon adapters are stubs with a stable `adapters[kind].apply` interface (`spend` | `book` | `message` | `cancel`). Each kind declares `reversible`; irreversible executions wait for the appeal window.
- Outline of the whole product on the **day-4 public Vercel URL**. Day 7 is MVP. Day 14 is startup-ready. After that: depth, not new entities.

## Layout (create these when code starts)

```
app/          Next.js App Router — observer UI + HTTP/MCP route handlers (Vercel)
contracts/    Python Intelligent Contracts (GenLayer testnet, not on Vercel)
agents/       reference protocol clients (Travel, Budget, Calendar, Security, …)
```

Guardian and spawn are protocol clients with their own keys, invoked by a request or a tick. State: Postgres.

Protocol methods: `POST /agents`, `GET /constitution`, `POST /actions`, `POST /actions/:id/objections`, `GET /inbox`, `POST /actions/:id/ack`, `GET /actions/:id`, `POST /cases/:id/appeal`, plus `POST /tick` for the scheduler.

## Stack

- Host: Vercel (previews from day 1, public URL by day 4).
- App: Next.js App Router. Gateway and observer are the same deploy.
- Store: Neon Postgres. Never process memory — serverless forgets.
- Timers: Vercel Cron → `POST /tick`, plus the same `sweep()` on every read.
- Contract: Python Intelligent Contract, GenLayer testnet (`genlayer-js` / official Python IC patterns).
- Observer UI: locales `en`, `es`, `de`, `tr`, `ru` via catalogs — no hardcoded copy. Source comments stay English.
- Chat with the human: Russian, short.

## Agent habits

- Prefer small, incremental changes. Do not invent a second architecture beside `docs/HACKATHON.md`.
- When you add modules, env vars, or API contracts, append a dated bullet to [Architecture change log](#architecture-change-log) in the same turn.
- New env keys go into `.env.example` with a short comment above each key.

## Architecture change log

- 2026-09-03: Repository bootstrap. Docs and agent instruction files only. No runtime yet.
- 2026-09-03: UI locales in the product plan: `en`, `es`, `de`, `tr`, `ru`.
- 2026-09-03: 14-day plan — public v0 day 4, MVP day 7, startup-ready day 14. Host: Vercel.
- 2026-09-03: Resolved open mechanics in the plan — `sweep()` via Vercel Cron `POST /tick` instead of daemons; agent key names the house plus a cabinet link for the principal; `allow_b` covers counter-action and pure block; `remedy` requires an executable `remedy_action`; `objection_grounded` drives the bond; `reversible` per kind gates execution against the appeal window; store is Neon Postgres.
- 2026-09-03: Day 1 runtime — Next.js App Router, Drizzle + Neon, protocol route handlers, agent/cabinet keys, offline judge, observer shell, i18n catalogs `en`/`es`/`de`/`tr`/`ru`. Propose/object/ack still 501 until day 2. Vercel Cron is daily on Hobby (`0 0 * * *`); silence still advances via lazy `sweep()` on every read. Upgrade the Vercel plan to run `/tick` every minute.
- 2026-09-03: Postgres is the Vercel Marketplace Neon resource `foyer` (not a claimable 72h neon.new database). Pull env with `vercel env pull`.
- 2026-09-04: Day 2 — propose / object / silence / ack / stub execute; `sweep()` closes windows and wakes the Budget guardian; cabinet wizard (rules, locked kinds, enable guardian, first pass / case A). Appeal still 501 until day 3.
- 2026-09-04: Day 3 — MCP HTTP transport at `POST /api/mcp` (same protocol tools); one Cursor connection card with copyable config and three prompt lines; spawn harness `POST /api/spawn` (throwaway house, not the product); principal appeal `POST /api/cases/:id/appeal` (cabinet bearer) re-tries the constitution snapshot or accepts a manual outcome; `objection_grounded` still drives the bond; locale `not-found` empty state.
