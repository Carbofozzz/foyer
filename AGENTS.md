# AGENTS.md

Working instructions for coding agents in this repository.

Canonical product: [`docs/INITIAL.md`](docs/INITIAL.md) (idea + what ships). Development plan: [`docs/ORCHESTRATE.md`](docs/ORCHESTRATE.md). If this file and a plan disagree, follow the codebase, then update the docs in the same change.

Private notes (pitch, discussion dumps) live in `.local/` and are gitignored. Do not copy them into tracked docs.

## Product

Foyer is an **intra-principal** coordination layer, court, and gateway: agents of one person or company share a wallet, calendar, and name, but not a goal. Track: **Onchain Justice**. Not escrow with a stranger. Not DAO governance. Chat agents propose; a callback checker can be woken. Hosting agents on Foyer is backlog. The longer direction is a full-time agent host, not only a court for chats you already have.

Three parts: **constitution** (plain language) → **gateway** (only exit to the world) → **court** (GenLayer reads constitution + evidence). Coordination happens before court.

The lock is **tools and keys**, not a prompt. An agent has no direct `stripe` / `calendar` tools. After a pass the gateway **permits**; the agent acts and reports.

## Invariants

- The gateway client is always an agent. The UI must not create a case around the API, and the gateway must never write an objection on an agent's behalf.
- Court outcomes: `allow` | `deny` | `escalate` (yes / no / human). `allow` permits the original payload. `deny` permits nothing — never someone else's `counter_action`. Archive rows may still say `allow_a` / `allow_b` / `remedy`.
- The court IC does not write a `remedy_action`. If the charter is silent or contradictory, the outcome is `escalate`.
- A verdict also answers `objection_grounded`. The house wallet pays GenLayer fees; the court IC does not hold or burn GEN.
- Silence in the window = consent (allow without court). Ack is owed only by engaged parties — the proposer and the objectors.
- **No daemons.** Time advances in `sweep(principal, now)`, called by the cron route `POST /tick` and by every protocol read. It must be idempotent.
- Every agent call carries an agent key, and the key names the house — that is why routes have no principal id. The principal signs in with their wallet (same address tops up the house). Spawn still uses a `cab_` link.
- A **product guardian** is another connected assistant that reads the constitution in its own model. **Demo** is one shared look-only house at `/:locale/cabinet/demo`. Do not mix the two.
- Propose has no `kind`. Adapter stubs still exist for old spend/book/message/cancel rows; the live loop is permit-then-act.
- Public product at **https://foyerapp.dev**. Next protocol change is [`docs/ORCHESTRATE.md`](docs/ORCHESTRATE.md), not a new entity beside the gateway.

## Layout (create these when code starts)

```
app/          Next.js App Router — observer UI + HTTP/MCP route handlers (Vercel)
contracts/    Python Intelligent Contracts (GenLayer testnet, not on Vercel)
```

A product guardian is a connected assistant. State: Postgres.

Protocol methods: `POST /agents`, `GET /constitution`, `POST /actions`, `POST /actions/:id/objections`, `POST /actions/:id/withdraw`, `POST /actions/:id/revise`, `POST /actions/:id/insist`, `GET /inbox`, `POST /actions/:id/ack`, `GET /actions/:id`, `POST /cases/:id/appeal`, plus `GET`/`POST /tick` for the scheduler.

## Stack

- Host: Vercel (previews and production). Public URL: https://foyerapp.dev.
- App: Next.js App Router. Gateway and observer are the same deploy.
- Store: Neon Postgres. Never process memory — serverless forgets.
- Timers: Vercel Cron → `POST /tick`, plus the same `sweep()` on every read.
- Contract: Python Intelligent Contract, GenLayer testnet (`genlayer-js` / official Python IC patterns).
- Observer UI: locales `en`, `es`, `de`, `tr`, `ru` via catalogs — no hardcoded copy. Source comments stay English.
- Chat with the human: Russian, short.

## Agent habits

- Prefer small, incremental changes. Do not invent a second architecture beside [`docs/INITIAL.md`](docs/INITIAL.md). Protocol replacement follows [`docs/ORCHESTRATE.md`](docs/ORCHESTRATE.md).
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
- 2026-09-05: Day 12 — `docs/CONNECT.md` plus `/:locale/connect` (Cursor / Claude / ChatGPT / OpenClaw, then HTTP). Cabinet connect keeps runtime tabs after the wizard. Tech tab adds MCP ping, `--propose`, and a link to that doc. Landing spawn is labeled a harness, not the product.
- 2026-09-05: Day 13 — public propose is capped (16 kb body, short justification/evidence, no nested payload extras, 24 open actions per house, 20 proposes/hour per agent on top of the IP limit). Legal and privacy stubs at `/:locale/legal` and `/:locale/privacy`. Cabinet stacks and wraps on a narrow screen. Leftover English kickers in `de` (`Gemeinschaft`, `Zeitplan`).
- 2026-09-05: Day 14 — startup-ready freeze. Presenter script `docs/DEMO.md` plus `npm run demo` (health + public pages). Replay adds silence `allow_a` (E) and contradictory-charter `escalate` (F) so all four outcomes are on the archive. Production URL is `https://foyerapp.dev`. OpenAPI `0.14.0`.
- 2026-09-06: Vercel Pro — cron `POST /api/tick` every minute (`* * * * *`). `CRON_INTERVAL_SEC` default is 60 so `/status` marks a missed minute as `stale`.
- 2026-09-06: Visual pass — two faces (`lib/i18n/font.ts` exports `serif` for display text and `sans`/Inter for UI, both as CSS variables on `<html>`); design tokens in `app/globals.css` (`--radius`, `--shadow-card`, `--shadow-raised`, `--ring`, `--hairline`, `--ease`); rounded cards and panels with soft shadows, hover/active/`:focus-visible` states on buttons and fields, pill agent chips, tabular numerals for amounts, `prefers-reduced-motion`. Pending buttons carry `aria-busy` instead of relying on `cursor: wait`. No markup or copy changes.
- 2026-09-06: Status pills — `app/components/status-pill.tsx` (`StatusPill` plus `statusTone` / `outcomeTone`) colours action state and the four outcomes in the cabinet feed and the replay archive. Tone tokens `--ok` / `--warn` / `--info` / `--danger`. Four short outcome labels (`cabinet.outcomeAllowA` / `outcomeAllowB` / `outcomeRemedy` / `outcomeEscalate`) added to all five catalogs; the long decision sentences are unchanged.
- 2026-09-06: Landing flow — `app/components/flow-diagram.tsx` sits above the three outline cards and walks one request through four nodes (assistants → gateway → court → payment/booking), with `cabinet.request` / `objection` / `decision` as wire labels, the four outcome pills inside the court node, and a CSS-only travelling pulse (no client JS, stacks vertically under 800 px). Two new keys `outline.flowAgents` / `outline.flowAction` in all five catalogs. `ProductOutline` now also takes `cabinet`.
- 2026-09-06: Cabinet chrome — runtime and role tabs in `ConnectCard` are a segmented control (`.segmented` / `.segment.is-active`, `aria-pressed`) instead of primary/ghost buttons; `.runtime-tabs` is gone. Cabinet `<details>` render as a settings list (full-width row, rotating chevron, hover, dividers under `.cabinet-meta`). Panel headers get a hairline, the feed keeps a `min-height` so open settings cannot squeeze it, and ghost buttons inside a `.stack` hug their label. `shortGen()` in `lib/gen/amount.ts` trims the displayed balance and transfer amounts to four decimals without rounding up (full value in `title`); dust never renders as a flat zero. Copy buttons flash `is-copied`.
- 2026-09-06: Cabinet overflow — the settings rows (`.cabinet-meta`, and the key export in the treasury) moved inside `.cabinet-scroll`, so an expanded section scrolls with the feed instead of spilling past the panel; `.cabinet-panel` is `overflow: hidden` as a backstop.
- 2026-09-06: Phrase-matching Budget / Calendar / Security / Legal / Finance clients are **test-only** (first pass, spawn). A product guardian is a second connected assistant that reads the constitution. Wizard, chips, Connect, Demo say so; free-form rules may never match.
- 2026-09-06: Post-day-14 depth (permit, not execute; door stats). Later folded into [`docs/INITIAL.md`](docs/INITIAL.md).
- 2026-09-06: Slice 1 — `sweep()` default `courts: 0`. Cabinet and protocol reads never call `openCourt`. Tick closes windows on every house, then opens at most one court (`findHouseNeedingCourt`). Index `actions(principal_id, status, silence_until)`.
- 2026-09-06: Slice 2 — a pass is `permitted` plus `may_act` / `permitted_payload`. Gateway does not call adapters. Silence and post-ack set permission only; irreversible kinds still wait the appeal window. OpenAPI `0.15.0`.
- 2026-09-06: Slice 3 — demo, Replay, `/check`, and `npm run demo` retarget to “pass → the agent acts”. No execute stub in the checklist.
- 2026-09-06: Slice 4 — `POST /api/actions/:id/report` `{ did }` and MCP `report`. Door stats on cabinet chips (derived). First-pass / spawn test clients report after permit. OpenAPI `0.16.0`.
- 2026-09-06: Cabinet is one column with tabs (activity, treasury, history, rules, connect, HTTP, people). Transfer and activity lists paginate. The treasury no longer sits beside the feed.
- 2026-09-06: Connect card drops runtime and role tabs. One MCP block and the three prompt lines — the snippet does not change by Cursor/Claude or Travel/Sales.
- 2026-09-06: Connect copy matches permit-then-act: Foyer does not pay or book. Snippets render in full (`pre.snippet`), not cropped textareas.
- 2026-09-06: Cabinet HTTP is not a tab. It sits under Connect as “HTTP and your own client”. `?tab=tech` opens Connect.
- 2026-09-06: Rules tab is editable for the owner (`POST /api/cabinet/:token/constitution`). Observers still only read.
- 2026-09-06: Cabinet treasury and transfer history are one tab. `?tab=history` opens Treasury.
- 2026-09-06: Landing drops the developer route list and the connect/check/status footer. Spawn copy is a demo. Waitlist emails list via `GET /api/waitlist` (cron secret).
- 2026-09-06: Demo is a static page (`/:locale/cabinet/demo`). No house, no first pass. Feed is the six archive cases. Same tabs as a live cabinet, mock treasury/connect, buttons do nothing. `/:locale/replay` redirects there.
- 2026-09-06: Live cabinet hides test clients by default (`test_clients`). Phrase-matchers and first-pass Travel/Assistant are `is_guardian`. Toggle on the feed. Wizard can skip the harness. Connect issues a real key, not the test Travel.
- 2026-09-06: One case per action — unique `cases.action_id`. `openCourt` claims the row before the GenLayer wait so tick and a late retry cannot judge the same deadlock three times. Treasury history lists a court fee only when it belongs to that case (appeals stay; race duplicates drop). Court rows show `case_id`.
- 2026-09-06: Site footer on every page (including the cabinet): © 2026 Foyer and “powered by” + a GenLayer link, plus legal / privacy. Dropped orphan public pages `/check`, `/replay`, `/status`, `/connect`. Legal and privacy copy matches the live product. No “back home” text links — the mark is enough.
- 2026-09-06: Court follows the GenLayer tx lifecycle. The hash is stored on `cases.tx` at submit. A later tick reads the stored status: wait until `FINALIZED`; `FINISHED_WITH_RETURN` then reads the IC JSON; `FINISHED_WITH_ERROR` (or an execution error, including no-consensus) may resubmit. After `COURT_TX_ERROR_LIMIT` (default 3) failures, escalate to the principal. No local “consensus did not land” verdict. No GEN for the fee escalates immediately. A submit/RPC miss counts toward the same limit; a poll miss while a hash exists stays pending.
- 2026-09-06: Cabinet test tab: the owner picks two test assistants, what one asks, and whether the other lets it through or objects. That writes a real `test_pass` action (court path still goes to GenLayer). Activity shows only a show/hide for those records — no agent chips, no regex guardian on sweep. Wizard ends after connect.
- 2026-09-06: Connect does not auto-mint Travel. The owner names an assistant and issues that key. One key is one agent. GET `/api/cabinet/:token/connect` only lists real keys.
- 2026-09-06: A test court request closes silence as soon as both texts are in. The feed says in court; tick still opens GenLayer. A leftover test objection is due on the next tick, not after the house silence window.
- 2026-09-06: `GET /api/tick` is the cron entry. Vercel Cron always GET; POST-only meant production returned 405 and never recorded a tick. POST still works for a manual sweep.
- 2026-09-06: Court queue skips spawn / unowned leftover houses. Tick opens a court only for a signed-in house. Cabinet feed shows the request time.
- 2026-09-06: Tick reads `get_verdict` with the house wallet. A finalized return with no JSON yet stays pending — it does not count as a tx error. A false offline escalate is replaced when the IC already has a verdict.
- 2026-09-06: Cabinet decide form only on `escalated`. The principal picks `allow_a` or `allow_b`. No note, no GenLayer re-trial. `POST /api/cases/:id/appeal` is that override.
- 2026-09-07: Docs: HACKATHON.md and IMPLEMENT.md merged into [`docs/INITIAL.md`](docs/INITIAL.md) (idea + shipped loop, no 14-day schedule). [`docs/ORCHESTRATE.md`](docs/ORCHESTRATE.md) is the development plan (wake, bargain, court on insist, yes/no/human). Idea: coordinate agents; host bidirectional ones when the principal has none; longer arc is a full-time agent host. Not implemented yet.
- 2026-09-07: Orchestrate O1 — schema: `agents.wake` (default `outbound`) + callback URL/secret; action revision / bargain fields; `wakes` table; objections unique on `(action, objector, revision)`. Types: `WAKE_KINDS`, `COURT_OUTCOMES` (`allow`/`deny`/`escalate`) next to live `OUTCOMES`. Loop still silence-to-court.
- 2026-09-07: Orchestrate O2 — Connect two kinds: chat (`outbound`, MCP as today), hook (`callback`, URL required), Foyer host (`hosted` row, worker in O6). `POST /api/agents` writes the same. Chips show kind and hook health. OpenAPI `0.17.0`.
- 2026-09-07: Orchestrate O3 — propose wakes callback agents with a signed POST; hosted rows are queued, not HTTP. Sweep retries pending wakes; silence-allow waits on required callbacks; a failed required wake escalates offline. Outbound chats are not POSTed. Auto-court from tick remains until O4. `FOYER_PUBLIC_URL` for cron `inbox_url`.
- 2026-09-07: Orchestrate O4 — proposer `withdraw` / `revise` / `insist`. Silence + objections → `bargaining`; tick does not start court. Bargain timeout escalates to the human, never GenLayer. `insist` creates the case and submits. OpenAPI `0.18.0`.
- 2026-09-07: Orchestrate O5 — IC answers `allow` / `deny` / `escalate` from a list of objections. Equivalence on outcome only. Permit never becomes a `counter_action`. Houses redeploy (`court_abi` 2); inflight cases keep `cases.contract`. Appeal is yes/no. OpenAPI `0.19.0`.
- 2026-09-07: Orchestrate O6 skipped — live path is outbound + callback; no hosted worker. Stop minting `wake = hosted`; enqueue wakes only for callbacks; leftover hosted wakes drain. Hosting is INITIAL backlog. OpenAPI `0.20.0`.
- 2026-09-07: Orchestrate O7 — cabinet feed lists every objection; counters are advice; verdict copy is yes/no/human. Demo archive rewritten (bargain, deny, allow, silence, escalate). Appeal stays yes/no. Test tab left for O8. OpenAPI `0.21.0`.
- 2026-09-07: Orchestrate O8 — cabinet test tab is the live loop as connected house agents. Collect timer, objections, bargain; inspect is raw `GET /actions/:id` / inbox. Phrase-matchers stay out. OpenAPI `0.22.0`.
- 2026-09-07: Test tab UX — propose form hides after send; growing step cards with per-agent API views; court explorer link; Stop returns to the form. Inbox inspect is this action only. OpenAPI `0.23.0`.
- 2026-09-07: Test cards follow the live protocol: Foyer wake step, canonical snapshots (not a live GET), available MCP handles at that moment, GenLayer link under insist. Outbound has no poll interval — that hole is visible. OpenAPI `0.24.0`.
- 2026-09-07: Connect prompt requires inbox poll every 30 s (chat is not woken). Test cards list available actions in words; request state opens a modal. OpenAPI `0.25.0`.
- 2026-09-07: Test cards: Foyer notice is its own plaque; respond (agent + text) sits below while the window is open. Agent actions are compact buttons (live or disabled). Only request state returns JSON; inbox and rules open a note. OpenAPI `0.26.0`.
- 2026-09-07: `kind` is any agent label, not spend/book/message/cancel only. House lock no longer rejects unknown kinds. Test form drops the type dropdown. OpenAPI `0.27.0`.
- 2026-09-07: Propose drops `kind` entirely. Agent sends text; the column stays empty for new rows. OpenAPI `0.28.0`.
- 2026-09-07: Test Foyer card lists only callback agents who were notified. Inbox poll copy stays on the proposer. Withdrawn card is “taken back”, with request state JSON.
- 2026-09-07: Bargain timeout is not insist. Test cards draw court only when `insisted_at` is set; offline escalate (a case without insist) shows human-decide plus allow/deny. OpenAPI `0.29.0`.
- 2026-09-07: Test cards: objection uses the same POST-method line as propose; initiator watches state; human-decide stays in history; refused ends the inbox poll (Connect rule). OpenAPI `0.30.0`.
- 2026-09-07: Test cards are active or historical. Service plaques have no actions; participant history is title + initiator state; live withdraw/revise/insist only on the active plaque. Bargain is not blocked by an offline escalate case. OpenAPI `0.31.0`.
- 2026-09-07: Human-decide card drops once a person sets allow/deny. Outcome copy names a human, not “you”. Poll stop cites `verdict.outcome`, not a invented refused. OpenAPI `0.32.0`.
- 2026-09-07: After a pass the test tab waits for `report`. Missed report notifies the human (not yes/no). Phrase-matchers still auto-report; cabinet test does not. OpenAPI `0.33.0`.
- 2026-09-07: `report` is an ack of the final allow or deny — no `did`. Window 5 minutes (`ack_until`). A miss notifies the owner that the agent ignored the flow; it does not re-judge the request. OpenAPI `0.34.0`.
- 2026-09-07: Removed phrase-matching clients (`agents/`). No first pass, no auto-ack, no test-client toggle. Leftover `is_guardian` rows stay hidden. OpenAPI `0.35.0`.
- 2026-09-08: Cabinet wizard is a modal (rules, optional agent, house top-up, contacts). One save at the end. Lock kinds dropped from onboarding. Studio faucet is a treasury POST. OpenAPI `0.36.0`.
- 2026-09-08: Landing copy in plain language. Dropped the three Rules/Gateway/Court cards. Flow diagram is the full branching path (quiet pass, talk, court, human). No “Foyer does not pay” line.
- 2026-09-08: Flow diagram is one rail instead of side-by-side forks — every row is a bullet plus a full-width card (`.flow-row` / `.flow-bullet`), numbered bullets mark the spine and hollow ones mark what can happen. Endings (`is-end`) are flat and tinted; the option that reaches court carries an accent left bar. The court node no longer repeats the three outcome pills — they head the three ending cards below it. `.flow-fork` / `.flow-branch` / `.flow-stem` / `.flow-num` are gone. The diagram has no `max-width` — it fills the content column like the cards below it. No copy or i18n change.
- 2026-09-08: Notify-the-human plan in [`docs/NOTIFY.md`](docs/NOTIFY.md): verified email then Telegram, decide-link on `escalated`, send from `sweep()`. Inventory of escalate stages vs the landing flow. Not implemented yet.
- 2026-09-08: N1 email — confirm tokens, Contacts tab, `sweep()` sends one escalate letter to a verified owner email (Telegram skips mail). Decide page `/:locale/decide/:token` is allow/deny without wallet login. OpenAPI `0.37.0`. Telegram stays disabled.
- 2026-09-08: N2 Telegram — start-link from Contacts/wizard, webhook `POST /api/telegram`, `telegram_chat_id` + linked-at. Escalate ping goes to Telegram when linked, otherwise verified email. OpenAPI `0.38.0`.
- 2026-09-09: Telegram link — hex `?start=` payload (no bare t.me), `getUpdates` after `deleteWebhook` on 409 so `/start` is not dropped, webhook handler is not rate-limited.
- 2026-09-09: `telegram_link_tokens.payload` was missing in Postgres; mint swallowed the insert and Contacts rendered an empty Telegram block. Column added; mint now `ADD COLUMN IF NOT EXISTS`.
- 2026-09-09: Telegram `/start` is claimed once (no linked/unknown/linked spam). Contacts wait copy only while unlinked. GET `?wake=1` drains updates; the 4s poll does not.
- 2026-09-09: Cabinet test does not POST house hooks or drain Telegram on each poll. Failed checker wakes no longer steal a test bargain. Decide links never use localhost.
- 2026-09-09: Public roadmap at `/:locale/roadmap` (INITIAL/ORCHESTRATE/NOTIFY backlog beyond shipped slices). Footer link.
- 2026-09-09: Cabinet HTML does not wait on hook POSTs or Telegram. After paint, `POST /api/cabinet/:token/sweep` then refresh.
- 2026-09-09: `insist` returns after the case row; GenLayer submit runs after the response. Test tab timer keeps ticking while the court tx is in flight.
- 2026-09-09: Feed pass — a cabinet record is a card: status pill + request time in the head, what was asked as the headline, objections on a rail below, verdict in a footer (outcome pill, sentence, muted notes). New catalog key `cabinet.objections` (plural label) in all five locales. `lib/i18n/when.ts` formats every date; treasury history rows show sign, amount and a muted date/case/hash line instead of a three-column stretch, demo cases carry fixed `at` times. Cabinet tab bar scrolls instead of wrapping, and the narrow-screen touch height applies to buttons, not to a `.segment` — a pill cell keeps a 2rem strip with its label centred. Diagram endings drop the rail so they align with the cards below; sign-in button lost its one-button card; `.snippet` wraps on words, not mid-token.
- 2026-09-09: Court IC `judge` drops unused `prior_verdict` / `appeal_note`. Houses redeploy (`court_abi` 3); inflight cases keep `cases.contract`. Principal override stays offline yes/no.
- 2026-09-09: Court fetches http(s) URLs cited by the proposer or objectors (`gl.nondet.web.get` in `judge`). Houses redeploy (`court_abi` 4). Inflight cases keep `cases.contract`.
- 2026-09-09: After a principal yes/no the feed names why it came to them (missed checker, bargain, court) and that they allowed or denied. Inbox verdict adds `prior_reasoning` / `prior_judge`. OpenAPI `0.39.0`.
- 2026-09-10: Tick sweeps only houses with live actions, pending wakes, unsent notify, or court. Idle inbox/MCP reads skip `sweep`. Contacts poll only while waiting for Telegram; test tab polls only while that pane is open and a test is live.
- 2026-09-11: Ops cabinet at `/:locale/cabinet/admin` for `FOYER_ADMIN_ADDRESS` (RainbowKit session). Lists waitlist emails, house contact emails, and houses with agent/hook/action/escalate counts. Ops can delete a waitlist row or a house (cascade). `GET`/`POST /api/admin`. OpenAPI `0.41.0`.
