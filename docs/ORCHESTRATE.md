# Orchestrate — development plan

Replace the shipped loop in [INITIAL.md](INITIAL.md) (propose → silence → any objection opens GenLayer; the IC picks `allow_a` / `allow_b` / `remedy` / `escalate`) with wake, bargain, and a cheap court that only answers the original proposal.

Until a slice here lands, **INITIAL.md and the codebase** are what runs. Update INITIAL and `AGENTS.md` in the same change as each slice so they do not describe the old loop.

Do not start a later slice before the previous one is done. Do not keep auto-court while adding hooks — that only multiplies paid cases.

---

## Target loop

1. Travel (often a chat) proposes: dates, amount, flight.
2. Foyer wakes every **bidirectional** agent in the house (callback URL or hosted worker). Outbound chats are not in that set.
3. Any number of them may object. Calendar: those dates are impossible. Budget: no money. Hosted constitution guardian: the charter forbids it. Each answer is a full objection, not a vote for a single opponent.
4. The proposer reads **all** objections and chooses: withdraw, revise (same action, new revision, wake again), or **insist**.
5. Only `insist` opens GenLayer. The IC sees the original proposal plus every objection as opinions. It answers **yes** (permit the original payload), **no** (do not), or **human** (constitution silent or contradictory). It does not pick a calendar counter-date or write a `remedy_action`. Changing the trip is revise, not court.
6. After a yes, the proposer `may_act` and does the work with its own tools, then `report`. After a no, payload is empty. After human, the principal picks yes or no on that same original proposal.

Court is a paid stand-in for the principal’s attention (~$1 / case), not a daily burn on every disagreement.

---

## What does not change

- Gateway client is always an agent. The UI does not open a case around the API. The gateway never writes an objection in its own name.
- One house, agent key names the house, principal wallet login, cabinet, permit-then-act, `report`, irreversible kinds wait the appeal window.
- No daemons. Time still advances in `sweep(principal, now)` on cron and on protocol reads.
- Phrase-matchers in `agents/` stay test-only. Demo stays `/:locale/cabinet/demo`.
- Chat runtimes (Cursor, Claude, ChatGPT, OpenClaw-as-MCP-client) cannot be woken. They propose and later read the inbox. They are not guardians of the window.

---

## Court outcomes (replacement)

| New | Meaning | Old |
|---|---|---|
| `allow` (yes) | Permit the proposer’s current payload | `allow_a` |
| `deny` (no) | Do not permit. Empty `permitted_payload` | `allow_b` as a pure block — **not** execute someone’s `counter_action` |
| `escalate` (human) | Principal decides yes/no on that payload | `escalate` |

Drop as court results: `allow_b` (run the objector’s action), `remedy`, `remedy_action`. `counter_action` on an objection stays as advice to the proposer during bargain only.

`objection_grounded`: per objection or “at least one had charter grounds”. Not “the second side was right”.

Principal appeal on `escalated`: yes or no on the original proposal — not `allow_a` / `allow_b`.

---

## Agent kinds

| `wake` | Connect | Role |
|---|---|---|
| `outbound` | Name → key → MCP/HTTP snippet | May `propose`, then `withdraw` / `revise` / `insist` / `ack` / `report` when the human opens the chat. Not woken. |
| `callback` | Name + hook URL + signing secret | Woken with a signed POST (`action_id`, revision, deadline, inbox hint). Reads the protocol, may object. Holds calendar / personal DB Foyer cannot see. |
| `hosted` | Cabinet: “run a Foyer guardian” | Same as callback from the house’s point of view. Process is ours: model + constitution, files objections with **that agent’s** key. Cannot see the client’s calendar or private DB. |

A bidirectional agent without a hook is not created. Several outbound chats do not replace one bidirectional agent.

---

## Bargain, then court

New proposer-only calls (HTTP + MCP): `withdraw`, `revise`, `insist`.

- **Withdraw** — action ends, no permit, no court.
- **Revise** — same `action_id`, new revision, new payload/justification, old objections archived, bidirectional agents woken again. Cap rounds (two or three).
- **Insist** — the only call that creates the case and **submits** `judge`. Tick does not start court.

If the collection window ends with zero objections after every required wake is delivered or failed: permit the proposal (today’s silence-allow).

If there is at least one objection: status `bargaining`, not court. Bargain timeout: withdraw or escalate to the human — **never** auto-court.

Failed wake of a required bidirectional agent: escalate to the human, not `allow`.

Outbound proposers see objections on the next inbox read. That is enough; do not invent a push into Cursor.

---

## Tick

Tick does **not** pick a house and open court. Delete `findHouseNeedingCourt` as a court starter and the sweep branch “silence passed + objections → `openCourt`”.

Keep tick as the clock:

- retry undelivered wakes
- close bargain / ack / appeal windows
- poll an **already submitted** court tx (`FINALIZED` → read verdict; error → retry / escalate after the limit)

`insist` submits (same as today’s `openCourt` write). Finalization still takes tens of minutes — do not wait inside `insist` or a cabinet read. If tick were removed entirely, the same poll would have to run on inbox/cabinet and would hit `maxDuration` again.

---

## Many objections everywhere

The store already allows several rows per action. The product does not: `judgeInput` sends `filed[0]`, the IC prompt is two-sided, `execute.ts` / cabinet / `allow_b` use `objections[0]`.

Every path (inbox, feed, bargain, `insist`, IC, verdict display) carries the **full list** for the current revision. The judge does not pick a winning objector to execute. It only answers the original idea.

Unique `(action, objector)` must include **revision**, or a revise cannot collect a second answer from the same calendar agent.

---

## Hosted guardian

Offer it in Connect when the house has only outbound agents: one bidirectional constitution reader so Travel is not talking to nobody.

Worker (e.g. `lib/guardian/hosted.ts`) runs from the same wake queue as callbacks. LLM key in `.env.example`. Bound work per tick so one request stays inside `maxDuration`. Prompt: charter + proposal; no pretend calendar. The worker calls `fileObjection` with the hosted agent’s key.

Client hook agents remain the right place for meetings and balances.

---

## Slices (code replacement order)

### O1 — Schema and types

**Files:** `lib/db/schema.ts` (migration), `lib/protocol/types.ts`.

- `agents.wake`, callback URL + secret, hosted flag.
- `actions`: revision, bargain deadline, round count, `insisted_at`, statuses `bargaining` / `withdrawn` (keep `open` for the collect window).
- `wakes` (or equivalent): action × bidirectional agent, `pending | delivered | failed`, attempts, error.
- Objection unique key includes revision.
- Verdict: `allow` \| `deny` \| `escalate`. No `remedy_action`. Grounded shape as above.
- Old `allow_b` / `remedy` rows: archive only; new code does not emit them.

**Check:** migrate an existing house; outbound agents default `wake = outbound`.

### O2 — Connect: two kinds

**Files:** `app/components/connect-card.tsx`, `lib/protocol/house-clients.ts`, `app/api/cabinet/[token]/connect/route.ts`, `app/api/agents/route.ts`, `lib/mcp/config.ts`, catalogs.

- Outbound: today’s snippet.
- Bidirectional: hook required, or “launch Foyer guardian” (worker can land in O6 if the row and CTA exist here).
- Chips show kind + hook health.

**Check:** cannot save a callback agent without a URL.

### O3 — Wake on propose / revise

**Files:** `lib/protocol/actions.ts`, new `lib/notify/wake.ts` (name as you like), `lib/protocol/sweep.ts`.

- After propose and after revise, enqueue wakes for every `callback` / `hosted` in the house.
- Signed POST body: `action_id`, revision, deadline, inbox URL. Agent loads the action through the protocol.
- Sweep retries `pending`. Collection does not close while required wakes are `pending`.
- All delivered, zero objections → today’s silence permit.
- Any failed required wake → `escalate`, not permit.

**Check:** two callback agents both get a POST; an outbound agent does not.

### O4 — Bargain API; stop auto-court

**Files:** `lib/protocol/actions.ts` (or `bargain.ts`), `lib/protocol/court.ts`, `lib/protocol/sweep.ts`, `app/api/tick/route.ts`, new routes under `app/api/actions/[id]/`, `lib/mcp/handler.ts`, `lib/openapi/spec.ts`.

- `withdraw` / `revise` / `insist` (proposer only).
- Sweep: do not call `openCourt` from silence + objections. Queue for submit is empty until `insist`.
- Tick: no `findHouseNeedingCourt` starter. Still sweep windows, wakes, and **existing** case tx poll.
- `insist` creates the case and submits `judge` with **all** current-revision objections.
- Bargain timeout: withdraw or human, never court.
- Inbox / `serializeAction`: all objections, revision, phase, what the proposer may call.

**Check:** object ×3, wait out the old silence window → still `bargaining`, no `cases` row, no GenLayer fee. `insist` creates one case. Timeout without `insist` does not submit.

### O5 — IC: yes / no / human, all opinions

**Files:** `contracts/court.py`, `lib/judge/onchain.ts`, `lib/protocol/court.ts` (`judgeInput`), `lib/protocol/execute.ts`, `lib/protocol/bundle.ts`, `lib/protocol/appeal.ts`.

- `judge` takes a JSON **list** of objections (who, text, optional `counter_action` as context). Prompt: support the proposal, reject it, or escalate. Do not select or execute a counter.
- Validator equivalence on the three outcomes only.
- `executeAfterAck`: `allow` → original payload; `deny` → empty; `escalate` → principal.
- Deployed ICs will not pick up a new signature. New `court.py`, redeploy per house. In-flight old cases: finish on the old contract or escalate honestly. Do not judge N-opinion cases on the old ABI.

**Check:** `insist` with three objections; explorer / stored verdict is yes, no, or human; permit never becomes a calendar `counter_action`.

### O6 — Hosted guardian

**Files:** `lib/guardian/hosted.ts` (or equivalent), wake dispatcher, Connect CTA, `.env.example`.

- Cabinet can mint `wake = hosted` when no bidirectional agent exists (and later too).
- Worker uses the agent key. Gateway does not insert `objections` itself.
- One hosted run per tick budget.

**Check:** house with only Cursor + hosted guardian: propose → hosted objection or pass appears without anyone opening a second chat.

### O7 — Cabinet, demo, copy, docs

**Files:** `app/components/cabinet-screen.tsx`, `appeal-form.tsx`, `demo-cabinet.tsx`, `lib/replay/archive.ts`, `messages/{en,es,de,tr,ru}.json`, `docs/CONNECT.md`, `docs/DEMO.md`, `docs/INITIAL.md`, `AGENTS.md` invariants, OpenAPI version.

- Feed lists every objection; no `firstObjection` / `objections[0]` for meaning.
- Show bargain phase and revision. Do not show a “court picked their booking”.
- Appeal: yes / no.
- Demo / Replay: the four-outcome archive (B/C `allow_b`, remedy) is rewritten so a stranger sees bargain then yes/no/human.
- Connect and MCP prompt lines: outbound proposes; bidirectional objects; court only after `insist`.
- Test tab (`test-request.ts`): either walk withdraw/revise/insist or stay a labeled harness that bypasses bargain — do not silently auto-court as if it were the product.

**Check:** live cabinet + demo + `npm run demo` tell the same story. Five locales.

---

## Out of scope here

Telegram and the other INITIAL backlog, bonds and court duties, Foyer paying or booking, A2A, waking Cursor, giving the hosted model the client’s calendar without a client hook or a later data connector, a fifth court outcome, raising courts-per-tick (there is no court-start queue).

---

## Done when

A house with an outbound Travel and at least one bidirectional checker (hook or hosted) can: propose → all checkers are called → several objections sit on the action → Travel withdraws or revises without a GenLayer fee → `insist` sends every opinion to the IC → verdict is only yes, no, or human → after yes, Travel acts and reports. A house with only chats is offered a hosted guardian and is not treated as if everyone consented.
