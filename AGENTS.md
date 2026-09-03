# AGENTS.md

Working instructions for coding agents in this repository.

Canonical product plan: [`docs/HACKATHON.md`](docs/HACKATHON.md). If this file and the plan disagree, follow the codebase, then update the docs in the same change.

Private notes (pitch, discussion dumps) live in `.local/` and are gitignored. Do not copy them into tracked docs.

## Product

Foyer is an **intra-principal** court and gateway: agents of one person or company share a wallet, calendar, and name, but not a goal. Track: **Onchain Justice**. Not escrow with a stranger. Not DAO governance.

Three parts: **constitution** (plain language) → **gateway** (only exit to the world) → **court** (GenLayer reads constitution + evidence).

The lock is **tools and keys**, not a prompt. An agent has no direct `stripe` / `calendar` tools. After a verdict the gateway calls adapters.

## Invariants

- The gateway client is always an agent. The UI must not create a case around the API.
- Court outcomes: `allow_a` | `allow_b` | `remedy` | `escalate`.
- Silence in the window = consent (allow without court).
- **Guardian** stays in the house after onboarding. **Spawn** is a temporary harness for guests with no runtime. Do not mix them.
- Hackathon adapters are stubs with a stable `adapters[kind].apply` interface (`spend` | `book` | `message` | `cancel`).
- Show the outline of the whole product, not one happy path. Depth comes after the hackathon, not new entities.

## Layout (create these when code starts)

```
contracts/    Python Intelligent Contracts (GenLayer)
gateway/      HTTP + MCP over the same protocol methods
agents/       reference clients (Travel, Budget, Calendar, Security, …)
observer/     principal cabinet
spawn/        harness that starts the same clients with test keys
```

Protocol methods: `POST /agents`, `GET /constitution`, `POST /actions`, `POST /actions/:id/objections`, `GET /inbox`, `POST /actions/:id/ack`, `GET /actions/:id`, `POST /cases/:id/appeal`.

## Stack

- Contract: Python Intelligent Contract, GenLayer testnet (`genlayer-js` / official Python IC patterns).
- Gateway: HTTP + MCP.
- Observer: web UI. Locales `en`, `es`, `de`, `tr`, `ru` via catalogs — no hardcoded copy. Source comments stay English.
- Chat with the human: Russian, short.

## Agent habits

- Prefer small, incremental changes. Do not invent a second architecture beside `docs/HACKATHON.md`.
- When you add modules, env vars, or API contracts, append a dated bullet to [Architecture change log](#architecture-change-log) in the same turn.
- New env keys go into `.env.example` with a short comment above each key.

## Architecture change log

- 2026-09-03: Repository bootstrap. Docs and agent instruction files only. No runtime yet.
- 2026-09-03: UI locales in the product plan: `en`, `es`, `de`, `tr`, `ru`.
