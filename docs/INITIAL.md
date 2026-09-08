# Foyer — idea and what ships

Intra-principal court and gateway. Track: **Onchain Justice**.

This file is the product as it exists: the idea, the running implementation, and a short backlog. Further protocol change is [ORCHESTRATE.md](ORCHESTRATE.md). If this file and the code disagree, follow the code, then update this file in the same change.

Connect paste: [CONNECT.md](CONNECT.md). Presenter walk: [DEMO.md](DEMO.md).

---

## Idea

One principal has several agents. They share a wallet, a calendar, and the right to speak in their name. They do not share a goal. The travel agent books business class. The budget agent blocks the card. Without a way to agree, the principal becomes support for their own bots.

Foyer is that way: a **mechanism for agents of one principal to coordinate actions**. A proposal is visible to the house. Those who can answer do. They bargain. Only if someone insists does a paid court (GenLayer) stand in for the human. Existing courts in the agentic economy judge a stranger. This one is internal: both sides are already yours.

The root is an **agent protocol**, not a page.

1. **Constitution** — the principal’s charter. Agents cite it. The court reads it.
2. **Gateway** — the only exit an agent has to the world. Propose, object, silence, ack, report. No pass — the agent must not pay, book, or message.
3. **Court** — when bargain fails, an Intelligent Contract answers the original proposal. The house wallet pays the fee. The principal may override an escalate.

Orchestration needs someone who can be **woken**. A chat in Cursor cannot. So Foyer is not only a door for agents you already run:

- Bring your own: outbound chats that propose, and bidirectional clients with a callback (calendar, budget, a process on your server).
- A house with only chats still treats silence as consent until a hook checker exists.
- The longer product idea is a **platform for full-time agents** — Foyer would host always-on agents here. That is backlog, not the live loop.

The human writes the constitution, watches a feed, and decides when the court returns the case. They do not play an agent.

This is **Onchain Justice**. Not Commerce (no deal with a stranger) and not Governance (no DAO vote). The lock is **tools and keys**, not a prompt. A prompt in the chat is a cheat sheet.

How wake, bargain, and court-on-insist land in code: [ORCHESTRATE.md](ORCHESTRATE.md). Propose POSTs to callback agents. Court opens only on `insist`. Foyer does not run hosted agents.

---

## What ships

Host: **Vercel**. Observer UI and the HTTP/MCP gateway are one Next.js App Router app. Intelligent Contracts stay on GenLayer testnet (`studioDevnet`). State is Neon Postgres. Production: **https://foyerapp.dev**.

```
  Agent (HTTP / MCP)                            cron GET /api/tick
           │                                           │
           ▼                                           ▼
     Agent protocol                              sweep(principal)
  register · propose · object · bargain      windows · poll one court tx
  inbox · ack · report · appeal                       │
           │                                          │
           ▼◄─────────────────────────────────────────┘
        Gateway
  constitution · lock · silence
  permit (the agent acts) · not execute
           │ insist (proposer) · not tick
           ▼
     Case + evidence → GenLayer IC
           │
           ▼
  Verdict → inbox · appeal window · report
```

The gateway client is always an agent. There is no UI path that opens a case around the API. The gateway never writes an objection in its own name.

### Auth

| Secret | Held by | Grants |
|---|---|---|
| Agent key (`agk_`) | An agent | Protocol for **that house only**. The key names the house; routes have no principal id. A key from another house is 404. |
| Wallet session | The principal (RainbowKit, short `personal_sign`) | Cabinet, constitution, appeal, treasury. One wallet is one house. Org members share the same login (`owner` / `operator` / `observer`). Spawn leftover `cab_` links still work. |

### Protocol

| Call | Who | Meaning |
|---|---|---|
| `POST /agents` | enroll token | Register; returns the long-lived agent key |
| `GET /constitution` | agent | House charter behind the key |
| `POST /actions` | agent | Propose + justification + evidence |
| `POST /actions/:id/objections` | agent | Veto + optional `counter_action` (advice during bargain) |
| `POST /actions/:id/withdraw` | proposer | End the action; no permit, no court |
| `POST /actions/:id/revise` | proposer | New revision + payload; checkers woken again. Cap 3 revisions |
| `POST /actions/:id/insist` | proposer | Only call that creates the case and submits `judge` |
| `GET /inbox` | agent | Actions, deadlines, verdicts, `may_act`, `phase`, `proposer_can` |
| `POST /actions/:id/ack` | agent | Engaged party accepted the outcome |
| `GET /actions/:id` | agent | Lock / court / permit |
| `POST /actions/:id/report` | proposer | Ack that you read the final allow or deny. No `did`. If missing for 5 minutes, the owner is notified |
| `POST /cases/:id/appeal` | principal | On `escalated` only: `allow` or `deny` on the original proposal. No note, no GenLayer re-trial |
| `GET`/`POST /tick` | cron | Sweep every house; poll **at most one** already submitted court |

MCP at `POST /api/mcp` is the same tools. `GET /api/openapi` is the spec. Every agent call is `Authorization: Bearer …`.

Any registered agent may object to any action. Veto rights are not a table — the constitution is prose; the court decides if the veto had grounds (`objection_grounded`).

Propose has no `kind`. The agent sends justification and payload (`summary`, optional amount). After a pass the gateway **permits**; it does not call adapters and does not pay. The agent acts with its own tools. `report` is an ack that the proposer read the final allow or deny — not whether they booked. The wizard still stores a lock list (`spend` / `book` / `message`) as house settings; it does not tag the action.

### Lifecycle of one action (as coded)

1. `POST /actions` opens the **silence window** and wakes every `callback` agent in the house. Chat (`outbound`) is not woken. `hosted` rows are reserved and not woken.
2. Any agent may object before the window closes.
3. **No objection** when the window closes, and every required callback wake is delivered → `permitted` with the proposed payload. No court. No ack. A required callback that **fails** → `escalate` (offline), not permit. Pending required wakes keep the window open.
4. **Any objection** when the window closes (and required wakes are not pending) → `bargaining`. The proposer `withdraw`s, `revise`s (new collection), or `insist`s. Tick does **not** open court.
5. **`insist`** creates the case and submits `judge` (does not wait for finalization). Later ticks poll until `FINALIZED`. Reads pass `courts: 0`. Bargain timeout without insist → offline `escalate` to the human, never GenLayer.
6. Ack is owed only by **engaged** parties (proposer and objectors of the current revision), or the ack timeout is recorded as an ack.
7. Appeal window: irreversible kinds stay unpermitted until it closes. An in-window principal override can still stop a pending spend. The live cabinet form is only on `escalated`.
8. Inbox shows `may_act` + `permitted_payload`, `revision`, `phase`, `proposer_can`. Empty payload means do not act. After a final allow or deny the proposer has 5 minutes to `report` (ack they read it). A miss notifies the owner — it is not a new yes/no.

Silence with no objection is consent. Chat agents are not woken; they see the inbox when they next call.

### Court outcomes (as coded)

`allow` | `deny` | `escalate`. No `allow_b` or `remedy` from new code.

| Outcome | After ack / timeout | When |
|---|---|---|
| `allow` (yes) | Permit the proposal | Proposal fits the charter better |
| `deny` (no) | Empty `permitted_payload` | Reject the original. Never execute someone’s `counter_action` |
| `escalate` (human) | Principal picks `allow` or `deny` on that payload | Charter silent or contradictory, or the tx failed past the error limit |

Old rows may still say `allow_a` / `allow_b` / `remedy`. Reads map `allow_a` → `allow`; `allow_b` / `remedy` escalate honestly so a calendar counter is never permitted.

The IC prompt takes a **list** of objections. Equivalence on chain: `outcome` only — never `reasoning`, never `objection_grounded`. `objection_grounded` is still stored (at least one objection had charter grounds).

Houses with an old four-outcome contract are redeployed on the next `insist`. Inflight txs keep the address they were submitted to (`cases.contract`).

One IC per house. Admin is the house wallet. `judge` / `get_verdict` are `_only_admin`. Tick reads with that wallet. No GEN in the contract. No local “consensus did not land” verdict: wait, retry on finalized error, then escalate to the human.

### Tick

No daemons. `sweep(principal, now)` is idempotent. Vercel Cron is `GET /api/tick` every minute (`* * * * *`); POST still works. Lazy sweep on every protocol read closes windows but **does not** submit court.

Tick **does not start** court. `findHouseNeedingCourt` only picks a house that already has an inflight or bare case so one tick can poll/submit that tx. `insist` is what creates the case.

### Cabinet

Product surface: `/:locale/cabinet`. Tabs: activity, treasury (wallet + history), rules, connect, test (owner — old harness, redesign later), people (org).

- Wallet login; house treasury is a different address, topped up from the signed-in wallet (Studio faucet below the floor).
- Owner edits the charter. Operator can appeal / connect / deposit. Observer reads. Owner alone withdraws, invites, writes the charter.
- Connect: name an assistant, issue a key, one MCP block + prompt lines (including: poll inbox at least every 30 s after propose). Chat = outbound. A checker needs a hook URL. No auto-mint Travel.
- Test tab: walk the live loop as connected assistants (propose, collect timer, object, bargain, inspect raw API JSON). Phrase-matchers stay out. Rows are `test_pass` so Activity can hide them.
- Demo: static `/:locale/cabinet/demo` — six archive cases (bargain then yes/no/human), buttons do nothing. Not a house.

Locales `en` / `es` / `de` / `tr` / `ru`. No hardcoded UI copy. Constitution text the principal typed is not auto-translated.

### Onboarding

1. Sign in with the wallet (one wallet, one house). Personal or org after login.
2. Constitution from questions (editable).
3. Lock kinds (spend / book / message).
4. Connect at least one assistant. Chat = MCP paste. A checker needs a hook URL.

Success: constitution visible, an agent key issued, the principal knows how to propose. A second **product** guardian is another connected assistant. The test tab walks that propose as a connected assistant.

### Test harness (not the product)

| Entrance | What |
|---|---|
| Your agent | Main path |
| Cabinet test tab | Walk the live loop as house agents |
| Landing spawn | Throwaway house |
| Demo / Replay | Static archive; `/replay` redirects to demo |

Copy: the test tab uses the house keys; it is not the product.

Reference conflicts A–F on the demo feed: several objections then court **deny**; revise without court; a pure block; insist then **allow**; silence **allow**; contradictory charter **escalate**. Court never executes a `counter_action`.

---

## Objects

| Object | Why |
|---|---|
| `Principal` | Charter, `personal` / `org`, windows, treasury, wizard flags |
| `Agent` | Party, role, key; `wake` `outbound` / `callback` / `hosted` (reserved, not minted; existing rows are outbound). `is_guardian` is leftover from deleted phrase-matchers |
| `Action` | Proposal, kind, payload, status (`open` / `bargaining` / `withdrawn` / …), revision, bargain deadline, `permitted_payload`, `test_pass` |
| `Objection` | Veto, evidence, optional `counter_action`; unique per action + objector + **revision** |
| `Wake` | Delivery of a propose to one callback agent (`pending` / `delivered` / `failed`) |
| `Case` | Constitution **snapshot**, tx, status. Unique per action |
| `Verdict` | outcome, `remedy_action`, reasoning, `objection_grounded`, judge, tx |
| `Execution` / receipts | Leftover from stub execute; new passes must not mean “Foyer paid” |
| `action_reports` | One ack per action that the proposer read the final allow or deny |

A case freezes the charter it was judged against. Editing the rules later does not rewrite that case.

---

## Stack

- Vercel (Hobby/Pro). Cron every minute. `CRON_SECRET` required. `CRON_INTERVAL_SEC` default 60.
- Next.js App Router, Drizzle + Neon.
- Python IC `contracts/court.py`, `genlayer-js` v2, house wallet pays fees.
- Rate limits and hashed request logs on public writes.
- `GET /api/health` — db + last tick (`stale` if the minute was missed).

---

## Do not treat as finished

- Live bank, Gmail, or calendar APIs (adapter modules may still exist; a pass is not a charge).
- Legal force of a verdict in the outside world.
- A court with a stranger (`escalate_external` exists, always false).
- Waking Cursor / Claude / ChatGPT. Inbox is pull.
- Teaching agents to get along in chat instead of the protocol.

Bonds, court duties, appeal fees, Foyer paying or booking, and a second login are out. Treasury is gas for Studio, not a product bank.

---

## Backlog (not the next protocol)

Active development of the loop is [ORCHESTRATE.md](ORCHESTRATE.md). Do not implement the items below in a way that fights that plan (no new auto-court, no judge-executed `allow_b` / `remedy`).

- **Hosted full-time agents.** Design first: who pays the model, tick vs always-on, connectors, not pretending the host sees Gmail or the calendar. Own key — the gateway never objects. Schema `wake = hosted` is reserved; Connect does not mint it. Do not ship a constitution bot in the gateway to “fill” a chat-only house.
- **Door hole:** stats only see what went through Foyer or was reported. Closing it is a one-shot capability after `may_act` (tools off until then).
- **Signatures / A2A**, mainnet GenLayer, richer window policy, pin agent version.
- **Scale:** many houses with in-flight txs — one poll job per house, not N courts inside one tick.
- Org: optional notice fan-out to operators; who withdraws vs who only reads is already in members.

---

## Risks that still apply

- A case created from the UI around the API.
- Gateway objects on someone’s behalf.
- In-memory state on Vercel.
- Hardcoded UI copy.
- Nothing moves without a click — `sweep()` on cron **and** on read; missed ticks visible.
- Public URL, open houses — agent key on writes, wallet session for the cabinet, unguessable ids.
- Free-text consensus — never compare `reasoning`.
- A fourth court outcome, or executing an objector’s `counter_action`.
