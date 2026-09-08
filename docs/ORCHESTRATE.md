# Orchestrate — development plan

Replace the shipped loop in [INITIAL.md](INITIAL.md) (propose → silence → any objection opens GenLayer; the IC picks `allow_a` / `allow_b` / `remedy` / `escalate`) with wake, bargain, and a cheap court that only answers the original proposal.

Foyer is a **coordination layer** for one principal’s agents, not only a court. Chat agents can propose; they cannot be woken. Coordination therefore needs bidirectional agents. You bring your own: a callback on your server. Foyer does not run hosted agents in this plan — that idea is backlog (who pays the model, connectors, tick budget, own key not a gateway veto). Live path is outbound chat + callback checker.

Until a slice here lands, **INITIAL.md and the codebase** are what runs. Update INITIAL and `AGENTS.md` in the same change as each slice so they do not describe the old loop.

Do not start a later slice before the previous one is done. Do not keep auto-court while adding hooks — that only multiplies paid cases.

---

## Target loop

1. Travel (often a chat) proposes: dates, amount, flight.
2. Foyer wakes every **callback** agent in the house. Outbound chats are not in that set.
3. Any number of them may object. Calendar: those dates are impossible. Budget: no money. Each answer is a full objection, not a vote for a single opponent.
4. The proposer reads **all** objections and chooses: withdraw, revise (same action, new revision, wake again), or **insist**.
5. Only `insist` opens GenLayer. The IC sees the original proposal plus every objection as opinions. It answers **yes** (permit the original payload), **no** (do not), or **human** (constitution silent or contradictory). It does not pick a calendar counter-date or write a `remedy_action`. Changing the trip is revise, not court.
6. After a yes, the proposer `may_act` and does the work with its own tools. After a no, payload is empty. After either final answer the proposer `report`s — ack that they read it, no `did`. After human, the principal picks yes or no on that same original proposal.

Court is a paid stand-in for the principal’s attention (~$1 / case), not a daily burn on every disagreement.

---

## What does not change

- Gateway client is always an agent. The UI does not open a case around the API. The gateway never writes an objection in its own name.
- One house, agent key names the house, principal wallet login, cabinet, permit-then-act, `report`, irreversible kinds wait the appeal window.
- No daemons. Time still advances in `sweep(principal, now)` on cron and on protocol reads.
- Demo stays `/:locale/cabinet/demo`.
- Chat runtimes (Cursor, Claude, ChatGPT, OpenClaw-as-MCP-client) cannot be woken. They propose and must poll inbox at least every 30 s until the action is decided. They are not guardians of the window.

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
| `hosted` | Reserved column. Not minted. | Backlog: a Foyer-run process with the agent’s own key. Not live. Do not offer it as a working Connect kind. |

A bidirectional agent without a hook is not created. Several outbound chats do not replace one callback checker. Silence among chats is still consent.

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

Every path (inbox, feed, bargain, `insist`, IC, verdict display) carries the **full list** for the current revision. The judge does not pick a winning objector to execute. It only answers the original idea. `counter_action` is advice during bargain, not a court result.

Unique `(action, objector)` includes **revision**, or a revise cannot collect a second answer from the same calendar agent.

---

## Hosted agents (backlog, not a slice)

Do not implement a Foyer-run constitution bot in this plan. Design first: who pays the model, tick vs always-on, connectors, not pretending the host sees Gmail or the calendar, gateway never objects in its own name. Schema `wake = hosted` stays reserved. Tracked in [INITIAL.md](INITIAL.md) backlog.

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

**Shipped:** columns and types are in. Live loop still uses `OUTCOMES` (`allow_a` / `allow_b` / `remedy` / `escalate`) until O5. New statuses and wakes are unused until O3–O4.

### O2 — Connect: two kinds

**Files:** `app/components/connect-card.tsx`, `lib/protocol/house-clients.ts`, `app/api/cabinet/[token]/connect/route.ts`, `app/api/agents/route.ts`, `lib/mcp/config.ts`, catalogs.

- Outbound: today’s snippet.
- Bidirectional: hook required. Do not offer a working “Foyer-hosted” agent (that idea is backlog; O6 skipped).
- Chips show kind + hook health.

**Check:** cannot save a callback agent without a URL.

**Shipped:** Connect and `POST /api/agents` accept `wake` `outbound` | `callback`. Callback requires `callback_url` (https, or http on localhost). `hosted` is reserved, not minted. Chips show kind and hook health.

### O3 — Wake on propose / revise

**Files:** `lib/protocol/actions.ts`, new `lib/notify/wake.ts` (name as you like), `lib/protocol/sweep.ts`.

- After propose and after revise, enqueue wakes for every `callback` in the house.
- Signed POST body: `action_id`, revision, deadline, inbox URL. Agent loads the action through the protocol.
- Sweep retries `pending`. Collection does not close while required wakes are `pending`.
- All delivered, zero objections → today’s silence permit.
- Any failed required wake → `escalate`, not permit.

**Check:** two callback agents both get a POST; an outbound agent does not.

**Shipped:** `POST /actions` (and MCP `propose`) enqueues a wake for every `callback` agent except the proposer. Leftover `is_guardian` rows are not woken. Callbacks get a signed POST (`action_id`, revision, `silence_until`, `inbox_url`). Hosted rows are not woken. Sweep retries `pending`. Silence-allow waits until required callbacks are delivered; a failed required wake escalates offline. Auto-court from tick is unchanged until O4. Revise is O4.

### O4 — Bargain API; stop auto-court

**Files:** `lib/protocol/actions.ts` (or `bargain.ts`), `lib/protocol/court.ts`, `lib/protocol/sweep.ts`, `app/api/tick/route.ts`, new routes under `app/api/actions/[id]/`, `lib/mcp/handler.ts`, `lib/openapi/spec.ts`.

- `withdraw` / `revise` / `insist` (proposer only).
- Sweep: do not call `openCourt` from silence + objections. Queue for submit is empty until `insist`.
- Tick: no `findHouseNeedingCourt` starter. Still sweep windows, wakes, and **existing** case tx poll.
- `insist` creates the case and submits `judge` with **all** current-revision objections.
- Bargain timeout: withdraw or human, never court.
- Inbox / `serializeAction`: all objections, revision, phase, what the proposer may call.

**Check:** object ×3, wait out the old silence window → still `bargaining`, no `cases` row, no GenLayer fee. `insist` creates one case. Timeout without `insist` does not submit.

**Shipped:** `withdraw` / `revise` / `insist` (proposer only, HTTP + MCP). Silence + objections → `bargaining`, not court. Tick no longer starts court (`findHouseNeedingCourt` only polls an existing case). Bargain timeout → offline escalate, never GenLayer. Inbox carries current-revision objections, `revision`, `phase`, `proposer_can`. IC payload still two-sided (`filed[0]` of the current revision) until O5. OpenAPI `0.18.0`.

### O5 — IC: yes / no / human, all opinions

**Files:** `contracts/court.py`, `lib/judge/onchain.ts`, `lib/protocol/court.ts` (`judgeInput`), `lib/protocol/execute.ts`, `lib/protocol/bundle.ts`, `lib/protocol/appeal.ts`.

- `judge` takes a JSON **list** of objections (who, text, optional `counter_action` as context). Prompt: support the proposal, reject it, or escalate. Do not select or execute a counter.
- Validator equivalence on the three outcomes only.
- `executeAfterAck`: `allow` → original payload; `deny` → empty; `escalate` → principal.
- Deployed ICs will not pick up a new signature. New `court.py`, redeploy per house. In-flight old cases: finish on the old contract or escalate honestly. Do not judge N-opinion cases on the old ABI.

**Check:** `insist` with three objections; explorer / stored verdict is yes, no, or human; permit never becomes a calendar `counter_action`.

**Shipped:** New `court.py` (`allow` / `deny` / `escalate`); `judge` takes a JSON list of objections. Validator equivalence on `outcome` only. `executeAfterAck` permits the original payload, nothing, or the principal — never a counter. Houses redeploy on next insist (`court_abi` = 2); inflight old txs keep `cases.contract`. Appeal is yes/no. OpenAPI `0.19.0`.

### O6 — skipped (live agents already work)

Outbound chat proposes; callback agents get a signed POST and object through the protocol. Bargain + `insist` + IC yes/no/human do not need a process Foyer runs.

Do **not** add `lib/guardian/hosted.ts`, an LLM env key, or a tick-budget hosted objector.

Hygiene only:

- Stop minting `wake = hosted` (Connect + `POST /agents`). Existing rows still display.
- Enqueue wakes only for `callback`. Leftover hosted wakes are drained, not required.
- Copy: a chat-only house is offered a **hook**. Silence among chats is consent.

**Check:** cannot create `wake = hosted`; a callback house still wakes on propose.

**Shipped:** no hosted worker. New agents are `outbound` or `callback` only. OpenAPI `0.20.0`.

### O7 — Cabinet, demo, copy, docs

**Files:** `app/components/cabinet-screen.tsx`, `appeal-form.tsx`, `demo-cabinet.tsx`, `lib/demo/preview.ts`, `messages/{en,es,de,tr,ru}.json`, `docs/CONNECT.md`, `docs/DEMO.md`, `docs/INITIAL.md`, `AGENTS.md` invariants, OpenAPI version.

- Feed lists every objection (justification + suggested counter as advice). Show revision. Do not show a “court picked their booking”.
- Bargain phase visible. Appeal: yes / no (already on the form).
- Demo / Replay: archive rewritten to bargain then yes / no / human.
- Connect and MCP prompt lines: outbound proposes and polls inbox every 30 s; hooked agents are woken; court only after `insist`. Chat-only house is offered a hook.

**Not in this slice:** the cabinet test tab. Leave the current harness. Redesign is O8.

**Check:** live cabinet + demo + `npm run demo` tell the same story. Five locales.

**Shipped:** feed lists every current-revision objection; counters are advice, not the verdict. Demo archive is bargain then yes/no/human. Appeal stays yes/no. Test tab was O8. OpenAPI `0.21.0`.

### O8 — Test tab (walk the live loop)

The tab is a **stage for the real protocol**, not a shortcut that closes silence or opens court. The cabinet never writes an objection or a case in its own name: every click runs as a chosen house agent (that agent’s key, same `propose` / `object` / `withdraw` / `revise` / `insist` as HTTP/MCP). Phrase-matchers stay out of this path.

Replace the current one-shot form (`pass` / `court`, silence snapped shut).

**Play**

1. Pick an agent + text. Send. That is `POST /actions` (`test_pass` so Activity can hide it). No `kind`.
2. A countdown shows the collect window (`silence_until`, house default 60 s). Timeline cards grow; callback agents get a real wake, outbound chats read inbox.
3. While the timer runs: a second form (agent + text) may file objections. Several agents, several rows. Do not skip the window.
4. Timer ends, zero objections → silence-allow. The card says the request is permitted. No court.
5. Timer ends, at least one objection → `bargaining`. The last card is the proposer’s move:
   - **Revise** — new payload, new revision, window and wakes again.
   - **Withdraw** — end, nothing permitted.
   - **Insist** — the only move that creates the case and submits GenLayer. The card links the court tx when it exists.
   - **Wait** — do nothing until `bargain_until`. That is **escalate to the principal**, never allow, never auto-court.
6. Withdraw is also available during the collect window (protocol already allows it).

Do not invent a fifth outcome. Counters on objections stay advice. Court answers yes / no / human on the original payload.

**What the agent sees**

Each step is a card in a growing history. After propose: a **Foyer sent a notice** card (hooks get a POST; chats are not woken). While the collect window is open, a separate **Respond** card picks an agent and files an objection. On each actor: compact buttons (live or disabled). Inbox and rules open a note; only **request state** returns JSON. Insist’s GenLayer link sits on the court card. **Stop test** hides the run and shows the form again.

**Check:** propose → wait out the timer → permitted, no case. Propose → object before the timer → bargaining, no case until insist. Inspector JSON matches `serializeAction`. Gateway still never objects.

**Shipped:** Test tab walks the live loop as connected house agents. Foyer notice and Respond are separate cards. Agent actions are compact buttons; only request state is JSON. Connect prompt requires inbox poll every 30 s. OpenAPI `0.26.0`.

---

## Out of scope here

Telegram and the other INITIAL backlog (including hosted agents), bonds and court duties, Foyer paying or booking, A2A, waking Cursor, a fifth court outcome, raising courts-per-tick (there is no court-start queue).

---

## Done when

A house with an outbound Travel and at least one callback checker can: propose → checkers are POSTed → several objections sit on the action → Travel withdraws or revises without a GenLayer fee → `insist` sends every opinion to the IC → verdict is only yes, no, or human → after a final answer Travel acks with `report`, then acts if `may_act`. A house with only chats is offered a hook; until then silence is consent.
