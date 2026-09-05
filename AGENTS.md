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
- A verdict also answers `objection_grounded`. The house wallet pays GenLayer fees; the court IC does not hold or burn GEN.
- Silence in the window = consent (allow without court). Ack is owed only by engaged parties — the proposer and the objectors.
- **No daemons.** Time advances in `sweep(principal, now)`, called by the cron route `POST /tick` and by every protocol read. It must be idempotent.
- Every agent call carries an agent key, and the key names the house — that is why routes have no principal id. The principal signs in with their wallet (same address tops up the house). Spawn still uses a `cab_` link.
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
- 2026-09-04: Day 3 — MCP HTTP transport at `POST /api/mcp` (same protocol tools); one connection card with copyable MCP config and three prompt lines; spawn harness `POST /api/spawn` (throwaway house, not the product); principal appeal `POST /api/cases/:id/appeal` (cabinet bearer) re-tries the constitution snapshot or accepts a manual outcome; `objection_grounded` still drives the bond; locale `not-found` empty state.
- 2026-09-04: Connect payload field is `mcp_config` (not `cursor_config`). The snippet is the standard MCP HTTP block; copy does not name a runtime.
- 2026-09-04: `GET /api/mcp` with an agent key is a ping (tool names + agent). JSON-RPC remains `POST`. Empty POST body is treated as `initialize`.
- 2026-09-04: Day 4 — public v0 outline on the landing (constitution, gateway, court); Replay archive of case A at `/:locale/replay` with honest `judge: offline` and no tx; cabinet feed says the same; wizard steps numbered 6.
- 2026-09-04: Day 5 — Python IC `contracts/court.py` (leader/validator; equivalence on `outcome` / `objection_grounded` / remedy kind+amount+currency, never `reasoning`); one IC per house; one signing wallet per house (sealed key, cabinet export). Constructor `admin` is that wallet; `judge` / `get_verdict` require `_only_admin`. Cabinet login is that same personal wallet (`personal_sign` → `foyer_session`); house treasury is a different address, topped up from the signed-in wallet. `genlayer-js` v2 on `studioDevnet` (alias `studionetdev`); fees via `estimateTransactionFeesForWrite` + `waitForFinalization`. `judge: onchain` with tx when consensus lands; otherwise `escalate`. The IC does not lock or burn GEN.
- 2026-09-04: Wallet-as-login is the account. `GET /api/auth/nonce`, `POST /api/auth/verify`, `POST /api/auth/logout`, `GET /api/me`. Product cabinet is `/:locale/cabinet` (`token=me`). `principals.owner_address` is unique. Spawn and leftover `cab_` links still work. Day 8 does not invent a second login.
- 2026-09-04: Cabinet auth is RainbowKit + wagmi (SIWE), not raw `window.ethereum`. Verify accepts `{ message, signature }`; nonce lives in `foyer_nonce`. Same `foyer_session` cookie. Optional `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- 2026-09-04: Wallet modal uses EIP-6963 (`getDefaultConfig`, no generic `injected`). `reconnectOnMount: false` so Rabby does not auto-open.
- 2026-09-04: Login sign is a short `personal_sign` text, not SIWE boilerplate. Connect button sits on the landing card, not the top bar.
- 2026-09-04: First wallet sign-in opens the house. No name/type form — one wallet is one house.
- 2026-09-04: After login the landing keeps the same wallet row plus a quiet cabinet link. Cabinet header is account + sign out; treasury does not repeat the address or Connect.
- 2026-09-05: Day 6 — cases B/C/D through protocol clients (Calendar, Security, Sales/Legal); `allow_b` as counter and as a pure block; Finance guardian on org spend. Wizard sets personal/org after login (no second login). First pass runs A+B+C or D. Connect card has Cursor / Claude / ChatGPT / OpenClaw tabs over the same MCP. Sweep wakes guardians by role.
- 2026-09-05: Day 8 — org members share the same wallet login. `house_members` holds `owner` / `operator` / `observer`; the owner invites a 0x address, the guest signs in with RainbowKit (no second password, no `cab_`). `/cabinet?house=` plus `x-foyer-house` open a membership; observer only reads, operator can appeal/connect/deposit, owner alone writes the charter, invites, withdraws. Connect can issue Sales / Legal / Finance (or Travel / Assistant) keys. Optional `FOYER_SEAL_SECRET` on Vercel seals keys separately from the cron secret.
- 2026-09-05: Audit follow-ups — `GET /api/openapi` returns the document itself (no `data` envelope) and is now a valid 3.1 spec with schemas, `operationId`s and declared auth per route, so a generator can read it. Every guardian gated the charter with dead logic (`!X.test(charter) && charter.length === 0`), so it objected regardless of the rules; each role now matches the clause that grants it the power, verified against all 80 assembled charter variants across the five locales. A deadlocked action past its silence window says "in court" instead of "waiting". Dropped the unused `POST /api/houses` (one wallet is one house) and the dead `nameLabel` / `typeLabel` / `cabinetHint` / `treasuryHint` / `noWallet` keys.
- 2026-09-05: Court audit — the IC never deployed, so every case escalated. Fixed `contracts/court.py` for the pinned runtime: the `Depends` header needed its own line, and this py-genlayer exports no `gl`, `TreeMap`, or `allow_storage` (use `import genlayer as gl`, `gl.contract.Contract`, `gl.storage.TreeMap`, `gl.vm.run_nondet`). Verdicts are stored as canonical JSON strings, no storage dataclass. Measured on studio-dev: deploy ~40 s and 0.1 GEN of fee budget, `judge` ~60 s. Hence `GENLAYER_TX_WAIT_RETRIES=24`, `GENLAYER_BUDGET_MS=100000`, and one court per `sweep()` (`sweep(id, now, { courts })`) so a request stays inside `maxDuration`; the rest are judged by the next read or tick. Below `COURT_FLOOR_WEI` (0.3 GEN) nothing is submitted: `lib/judge/funds.ts` tops the house wallet up from the Studio faucet (`sim_fundAccount`, off with `GENLAYER_FAUCET=off`), and an unfunded house gets an honest `escalate` reasoning instead of a silent one. Smoke: `npm run court:smoke`. `.env.example` is tracked again (a duplicate `.env*` in `.gitignore` hid it).
- 2026-09-05: Day 7 MVP — tech tab in the cabinet (OpenAPI at `GET /api/openapi`, curl, Python, `npm run http:client`); agent chips show live vs waiting; community checklist at `/:locale/check`; Replay archives A–D; optional `NEXT_PUBLIC_REPLAY_TX` for a recorded on-chain hash. MVP freeze.
- 2026-09-05: Day 9 — landing pricing stub plus `POST /api/waitlist` (email + locale; same address is a no-op). The home protocol list is folded. Cabinet copy drops house/casa/Haus/ev. Native pass over `es` / `de` / `tr` (Panel, Sie, titular, Aktivite). Charter strings that gate guardians are unchanged.
- 2026-09-05: Day 10 — `spend` is almost-real (`spend_receipts`, result `charged`) and `reversible: false`, so execute waits for the appeal window; `book` / `message` / `cancel` stay stubs. An in-window appeal replaces the verdict and can stop a pending spend. `verdicts.escalate_external` is in the model and always false (no bridge).
- 2026-09-05: Day 11 — public writes (waitlist, spawn, auth, propose/object, enroll, MCP) go through a Postgres rate limit and a request log (hashed IP, no bodies). `GET /api/health` and `/:locale/status` show db + last cron tick; a late tick is `stale`. Preview and production share the same limiter and store; only production runs Vercel Cron, and both require `CRON_SECRET`. Optional `CRON_INTERVAL_SEC` (default 86400).
