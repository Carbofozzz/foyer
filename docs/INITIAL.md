# Foyer — idea and what ships

Intra-principal court and gateway. Track: **Onchain Justice**.

This file is the product as it exists: the idea, the running implementation, and a short backlog. The next protocol change (wake, bargain, court only on insist) is [ORCHESTRATE.md](ORCHESTRATE.md). If this file and the code disagree, follow the code, then update this file in the same change.

Connect paste: [CONNECT.md](CONNECT.md). Presenter walk: [DEMO.md](DEMO.md).

---

## Idea

One principal has several agents. They share a wallet, a calendar, and the right to speak in their name. They do not share a goal. The travel agent books business class. The budget agent blocks the card. Without a court, the principal becomes support for their own bots.

Existing courts in the agentic economy judge a stranger. This court is internal: both sides are already yours.

The root is an **agent protocol**, not a page.

1. **Constitution** — the principal’s charter. Agents cite it. The court reads it.
2. **Gateway** — the only exit an agent has to the world. Propose, object, silence, ack, report. No pass — the agent must not pay, book, or message.
3. **Court** — deadlock goes into a GenLayer Intelligent Contract. The house wallet pays the fee. The principal may override an escalate.

The human writes the constitution, watches a feed, and decides when the court returns the case. They do not play an agent.

This is **Onchain Justice**. Not Commerce (no deal with a stranger) and not Governance (no DAO vote).

The lock is **tools and keys**, not a prompt. A prompt in the chat is a cheat sheet.

---

## What ships

Host: **Vercel**. Observer UI and the HTTP/MCP gateway are one Next.js App Router app. Intelligent Contracts stay on GenLayer testnet (`studioDevnet`). State is Neon Postgres. Production: **https://foyerapp.dev**.

```
  Agent (HTTP / MCP / test tab)                 cron GET /api/tick
           │                                           │
           ▼                                           ▼
     Agent protocol                              sweep(principal)
  register · propose · object                windows · at most one court
  inbox · ack · report · appeal                       │
           │                                          │
           ▼◄─────────────────────────────────────────┘
        Gateway
  constitution · lock · silence
  permit (the agent acts) · not execute
           │ deadlock (objections + window closed)
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
| `POST /actions/:id/objections` | agent | Veto + optional `counter_action` |
| `GET /inbox` | agent | Actions, deadlines, verdicts, `may_act` |
| `POST /actions/:id/ack` | agent | Engaged party accepted the outcome |
| `GET /actions/:id` | agent | Lock / court / permit |
| `POST /actions/:id/report` | agent | `{ did }` after a pass (or a break of the door) |
| `POST /cases/:id/appeal` | principal | On `escalated` only: `allow_a` or `allow_b`. No note, no GenLayer re-trial |
| `GET`/`POST /tick` | cron | Sweep every house; open **at most one** court |

MCP at `POST /api/mcp` is the same tools. `GET /api/openapi` is the spec. Every agent call is `Authorization: Bearer …`.

Any registered agent may object to any action. Veto rights are not a table — the constitution is prose; the court decides if the veto had grounds (`objection_grounded`).

`kind`: `spend`, `book`, `message`, `cancel`. Each kind declares `reversible`. `spend` is irreversible and waits the appeal window. After a pass the gateway **permits**; it does not call adapters and does not pay. The agent acts with its own tools, then `report`.

### Lifecycle of one action (as coded)

1. `POST /actions` opens the **silence window**.
2. Any agent may object before the window closes.
3. **No objection** when the window closes → `permitted` with the proposed payload. No court. No ack.
4. **Any objection** when the window closes → `inCourt`. Tick (not a cabinet read) claims the case, submits `judge`, stores `cases.tx`. Later ticks poll until `FINALIZED`. Reads pass `courts: 0` so the cabinet does not wait on GenLayer.
5. Ack is owed only by **engaged** parties (proposer and objectors), or the ack timeout is recorded as an ack.
6. Appeal window: irreversible kinds stay unpermitted until it closes. An in-window principal override can still stop a pending spend. The live cabinet form is only on `escalated`.
7. Inbox shows `may_act` + `permitted_payload`. Empty payload means do not act.

Silence with no objection is consent. Chat agents are not woken; they see the inbox when they next call. Phrase-matching clients in `agents/` do **not** run on sweep.

### Four outcomes (as coded)

No fifth. `allow_b` covers a counter-action **or** a pure block.

| Outcome | After ack / timeout | When |
|---|---|---|
| `allow_a` | Permit the proposal | Proposal fits the charter better |
| `allow_b` | Permit the objector’s `counter_action`, or nothing if it was a pure block | The veto wins. Code uses the **first** objection |
| `remedy` | Permit `remedy_action` | Neither side; must be an executable action or the IC must `escalate` |
| `escalate` | Principal picks `allow_a` or `allow_b` | Charter silent or contradictory, or the tx failed past the error limit |

The IC prompt is two-sided (`objection` singular). Several objection rows can exist in Postgres; `judgeInput` sends `filed[0]`. Equivalence on chain: `outcome`, `objection_grounded`, remedy kind + payload — never `reasoning`.

One IC per house. Admin is the house wallet. `judge` / `get_verdict` are `_only_admin`. Tick reads with that wallet. No GEN in the contract. No local “consensus did not land” verdict: wait, retry on finalized error, then escalate to the human.

### Tick

No daemons. `sweep(principal, now)` is idempotent. Vercel Cron is `GET /api/tick` every minute (`* * * * *`); POST still works. Lazy sweep on every protocol read closes windows but **does not** submit court.

Tick still **starts** court today: one signed-in, non-spawn house per minute via `findHouseNeedingCourt`. That is what [ORCHESTRATE.md](ORCHESTRATE.md) removes.

### Cabinet

Product surface: `/:locale/cabinet`. Tabs: activity, treasury (wallet + history), rules, connect, test (owner), people (org).

- Wallet login; house treasury is a different address, topped up from the signed-in wallet (Studio faucet below the floor).
- Owner edits the charter. Operator can appeal / connect / deposit. Observer reads. Owner alone withdraws, invites, writes the charter.
- Connect: name an assistant, issue a key, one MCP block + three prompt lines. No auto-mint Travel.
- Test tab: two test assistants, pass or court; real `test_pass` rows. Phrase-matchers are hidden unless `test_clients` is on.
- Demo: static `/:locale/cabinet/demo` — six archive cases, buttons do nothing. Not a house.

Locales `en` / `es` / `de` / `tr` / `ru`. No hardcoded UI copy. Constitution text the principal typed is not auto-translated.

### Onboarding

1. Sign in with the wallet (one wallet, one house). Personal or org after login.
2. Constitution from questions (editable).
3. Lock kinds (spend / book / message).
4. Connect at least one assistant (MCP paste). Optional hosted-looking **test** clients — labeled test; they only match canned phrases.

Success: constitution visible, an agent key issued, the principal knows how to propose. A second **product** guardian is another connected assistant, not the regex clients. The test tab can put a propose in the feed without a live runtime.

### Test harness (not the product)

| Entrance | What |
|---|---|
| Your agent | Main path |
| Cabinet test tab | Owner-authored pass or court |
| Landing spawn | Throwaway house |
| Demo / Replay | Static archive; `/replay` redirects to demo |

Copy: test agents speak the protocol; they are not the product.

Reference conflicts A–D (travel/budget, calendar, security message, sales/legal) still explain why `allow_b` has two readings. Demo feed includes silence-allow (E) and contradictory-charter escalate (F).

---

## Objects

| Object | Why |
|---|---|
| `Principal` | Charter, `personal` / `org`, windows, treasury, wizard flags |
| `Agent` | Party, role, key; `is_guardian` marks test phrase-matchers |
| `Action` | Proposal, kind, payload, status, deadlines, `permitted_payload`, `test_pass` |
| `Objection` | Veto, evidence, optional `counter_action` |
| `Case` | Constitution **snapshot**, tx, status. Unique per action |
| `Verdict` | outcome, `remedy_action`, reasoning, `objection_grounded`, judge, tx |
| `Execution` / receipts | Leftover from stub execute; new passes must not mean “Foyer paid” |
| `action_reports` | One `{ did }` per action |

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

- **Telegram** (email fallback): notify the owner on escalate / appeal window. No Telegram login.
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
- `remedy` without `remedy_action` (while the four-outcome IC still ships).
