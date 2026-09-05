# Foyer — Intra-Principal Court

Hackathon build guide. Track: **Onchain Justice**.

> The product is an agent gateway and a court for agents of one principal. The lock is tools and keys, not a prompt. Onboarding leads both a technician and someone who barely stood up their first agent in a chat. Test spawn is only for people with no agent at all.

---

## 1. Idea

One principal has several agents. They share a wallet, a calendar, and the right to speak in their name. They do not share a goal. The travel agent books business class. The budget agent blocks the card. Without a court, the principal becomes support for their own bots.

Existing courts in the agentic economy judge a stranger. This court is internal: both sides are already yours.

The root is an **agent protocol**, not a page.

1. **Constitution** — the principal’s charter. Agents cite it. The court reads it.
2. **Gateway** — the only exit an agent has to the world. Propose, object, silence, ack. No pass — no booking, payment, or message.
3. **Court** — deadlock goes into an Intelligent Contract. Validators: `allow_a`, `allow_b`, `remedy`, `escalate`. The gateway executes. Both agents get the outcome. The principal may appeal.

The human writes the constitution, watches a feed of verdicts, and appeals when needed. They do not play an agent.

This is **Onchain Justice**. Not Commerce (no deal with a stranger) and not Governance (no DAO vote).

---

## 2. Hackathon-version scope

Duration: **14 days**. Host: **Vercel** (public URL from day 4).

| When | What “done” means |
|---|---|
| **Day 4** | First public version: a stranger can open a Vercel URL, walk the wizard, and see a live case (court may still be `judge: offline`). |
| **Day 7** | Hackathon MVP: every row in the table below works in substance. |
| **Day 14** | Startup-ready: same product, production-shaped (auth, persistence, landing, prod deploy, connect docs). |
| **After** | Depth, not new entities: real adapters, money in the bond, bridge to an external court. |

The outline of the **whole** product exists from day 4. Days 5–14 deepen quality. Do not add a new isolated feature on day 13 that was missing from the outline.

### Must work in substance

| Function | Day 7 MVP | After day 14 |
|---|---|---|
| Agent protocol | register, constitution, propose, object, inbox, ack | Signatures, A2A, foreign runtimes |
| Silence window | No object in N seconds → allow without court | Policy by kind / amount |
| Timers | Cron sweep + lazy sweep on every read; no daemons | Queue with per-kind policy |
| Court: 4 outcomes | `allow_a` / `allow_b` / `remedy` / `escalate` in the contract | Richer remedy, partial allow |
| Evidence | Text, links, stub attachments in the case packet | Live calendar, receipt, email |
| Verdict execution | Adapter `spend` / `book` / `message` / `cancel`: log + stub “executed” | Real card, calendar, mail APIs |
| Ack | Engaged parties ack (or timeout) before the lock lifts | Penalty for ignore |
| Access | Agent keys + wallet login for the principal (`cab_` only for spawn) | Org members, roles |
| Principal appeal | `POST /cases/:id/appeal` → re-trial or manual outcome | Bond, window, cost |
| Bond for object | House wallet pays GenLayer tx fees; the court IC does not lock or burn GEN | Per-agent wallets, appeal economics |
| Several roles | Personal: Travel, Budget, Calendar, Security. Org: Sales, Legal, Finance | Arbitrary principal roles |
| Two principal types | Personal and corporate constitution | Multi-org, teams |
| MCP | Tools = the same protocol methods | Catalog, foreign clients |
| External agent | Spec + sandbox + one live third-party client (script / GPT tools / any HTTP) | OpenClaw, A2A discovery |
| Observer | Gateway mirror: agents, inbox, cases, verdicts, execution, appeals | Principal cabinet |
| Onboarding | Wizard: charter from questions, one-click guardian, connect your agent by runtime | Card/calendar OAuth, guardian store |
| UI locale | `en`, `es`, `de`, `tr`, `ru` catalogs; no hardcoded copy; language switcher. `en` / `ru` written, the rest drafted day 1 and reviewed day 9 | More locales, RTL |
| On-chain | At least some cases on GenLayer, tx on the verdict | Mainnet, bridge to an external Internet Court |

### Test mode (not the core)

Spawn test agents and Replay — so the community with no runtime can open the same protocol. They do not replace the functions above and they do not go to court around the API.

### Do not promise as finished reality

- Live access to a bank, Gmail, calendar (at the hackathon — adapter interface + stub).
- Legal force of a verdict in the outside world.
- A full Internet Court / escrow with a stranger (a different product; leave only an `escalate_external` field for later).
- Teaching agents to “get along” in chat instead of going to court.

In other words: **the adapter exists; the wire to the bank comes after day 14**. Court, gateway, outcomes, appeal, MCP — already on the day-7 MVP.

---

## 3. Root architecture

The gateway client is always an agent. There is no separate path “the website created a case.”

Host: **Vercel**. Observer UI and the HTTP/MCP gateway are one Next.js App Router app (Route Handlers). Intelligent Contracts stay on GenLayer testnet — they do not run on Vercel. State lives in Neon Postgres so public deploys survive cold starts.

```
  Agent A          Agent B          Agent C …        cron
  HTTP / MCP / test spawn / human-adapter          POST /tick
           │                                           │
           ▼                                           ▼
     Agent Protocol                              sweep(principal)
  register · propose · object                windows · guardian turn
  inbox · ack · appeal (principal)                    │
           │                                          │
           ▼◄─────────────────────────────────────────┘
        Gateway
  constitution · lock · silence
  bond · execute(kind) stub
           │ deadlock
           ▼
     Case + evidence
           │
           ▼
  Intelligent Contract (GenLayer)
           │
           ▼
  Verdict → inbox of all parties
  execute stub · appeal window
```

Client implementations (`external`, `test`, `human-adapter`) are runtime metadata. That field does not exist on `Case`.

### There are no daemons — the tick does the waiting

Serverless has nobody to sit and watch a countdown. Two triggers, one code path:

- **Cron sweep.** A scheduled route (`POST /tick`, Vercel Cron, ~every minute) closes silence windows, expires ack timeouts, closes appeal windows, and gives the guardian its turn to read the inbox and object.
- **Lazy sweep on read.** Any protocol call first advances the clock for the house it touches. So a demo does not wait for the next cron minute, and a cold project still behaves correctly.

Both call the same `sweep(principal, now)`. It must be idempotent: two ticks in the same second change nothing twice.

The **guardian is a normal protocol client**, not gateway code. The tick invokes it the way a cron invokes any client: it reads `GET /inbox` with its own agent key and decides whether to `POST /actions/:id/objections`. The gateway never writes an objection on anyone’s behalf — otherwise “silence = consent” would be a lie and the client-is-always-an-agent invariant would break.

### Who is talking (auth)

Two secrets from day one. No anonymous writes on a public URL.

| Secret | Held by | Grants |
|---|---|---|
| **Agent key** | An agent (issued by the wizard, baked into the copyable config) | Protocol calls **for its house only**. The house is derived from the key — that is why routes have no principal in the path. |
| **Wallet session** | The principal (same address that tops up the house treasury) | Observer, wizard, appeal. Spawn still uses a `cab_` link. |

House ids are opaque and unguessable. Login is the personal wallet — day 8 does not invent a second account path. The agent key does not change shape.

### Protocol

| Call | Who | Meaning |
|---|---|---|
| `POST /agents` | agent | Register: id, role, callback or poll. Authorized by the enrollment token from the wizard; the response returns the long-lived agent key |
| `GET /constitution` | agent | Constitution of the house behind the key |
| `POST /actions` | agent | Action + justification + evidence |
| `POST /actions/:id/objections` | agent | Veto + justification + evidence + bond + optional counter-action |
| `GET /inbox` | agent | Other agents’ actions, deadlines, verdicts |
| `POST /actions/:id/ack` | agent | Accepted the outcome, ready for execute |
| `GET /actions/:id` | agent | Lock / court / execution status |
| `POST /cases/:id/appeal` | principal | Re-trial or manual override (wallet session or spawn `cab_`, not an agent key) |
| `POST /tick` | scheduler | Cron sweep: silence, ack, appeal windows, guardian turn |

Every agent call carries the agent key (`Authorization: Bearer …`). There is no principal id in the path: the key names the house. A key from another house is a 404, not a 403 — houses do not leak each other’s existence.

MCP: the same tool names. The human-adapter sends the same JSON. Test spawn starts processes that call the same URLs.

**Any registered agent may object to any action.** The gateway does not hold a table of veto rights — the constitution is prose, so legitimacy is decided by the court, and a groundless veto costs bond. That is the whole point of case C: whether Security may block *this* message is a question for the judge, not for a permission flag.

`kind`: `spend`, `book`, `message`, `cancel`. Execute is `adapters[kind].apply(verdict, action)`. At the hackathon each adapter writes a structured log (`would_charge`, `would_book`, …). The interface is already the one that stays for real APIs.

Each kind declares `reversible: true | false`. Stubs are reversible. A real card charge is not. That flag, not the kind name, decides whether execution waits for the appeal window.

### What the four outcomes mean

Four outcomes, no fifth. `allow_b` covers both shapes of a veto, which is why an objection may carry a counter-action.

| Outcome | Executed | When |
|---|---|---|
| `allow_a` | The proposed action | The proposal follows the constitution better |
| `allow_b` | The objector’s `counter_action`, or **nothing at all** if the objection was a pure block | The veto wins |
| `remedy` | The verdict’s `remedy_action` | Neither side is right, and a third action follows the constitution better |
| `escalate` | Nothing until the principal decides | The constitution is silent or its articles contradict |

`remedy` is not prose the gateway has to interpret. The verdict carries a **`remedy_action`**: the same shape as an `Action` (`kind` + payload), plus one or two sentences of human explanation. If the validators cannot express the compromise as an action, the outcome is `escalate` — never a remedy the gateway cannot execute.

### Lifecycle of one action

1. `POST /actions` locks the action and opens the **silence window**.
2. Any agent may `POST /actions/:id/objections` (with an optional `counter_action`) before the window closes.
3. **No objection** → allow, no court, no ack from anyone. Only the proposer is engaged, and it already spoke by proposing.
4. **Objection** → deadlock → case → verdict.
5. **Ack** is required only from **engaged parties** — the proposer and the agents that objected. A silent agent never owed an ack. The ack timeout counts as an ack and is recorded as such.
6. The **appeal window** opens with the verdict. A `reversible` kind executes right after ack; an irreversible one waits for the appeal window to close. An appeal filed in time stops a pending execution.
7. `Execution` is written; the outcome lands in the inbox of every party.

Both windows and the ack timeout are per-principal settings with defaults, not magic numbers scattered in the code.

### Objects

| Object | Why |
|---|---|
| `Principal` | Constitution, type `personal` / `org`, silence window, ack timeout, appeal window, cabinet token |
| `Agent` | Party, role, key, bond balance |
| `Action` | Proposal, kind, payload, evidence, lock state, deadlines |
| `Objection` | Veto, evidence, bond, optional `counter_action` |
| `Case` | Constitution snapshot, parties, status |
| `Verdict` | outcome, `remedy_action`, reasoning, `objection_grounded`, judge (`onchain`/`offline`), tx, appeal_of |
| `Execution` | kind, stub result, timestamp |

The `Case` freezes the constitution text it was judged against. An appeal re-runs **that snapshot**, not whatever the principal typed since — otherwise editing the charter would silently rewrite history.

### Question to validators

> Given constitution, proposed_action, objection (with its optional counter_action), and evidence. Which decision best executes the constitution: `allow_a`, `allow_b`, `remedy`, or `escalate`? If `remedy` — return `remedy_action` as an executable action (`kind` plus payload fields of the same shape as the proposal) and explain it in one or two sentences; if no such action can be written, answer `escalate` instead. If the constitution is silent or articles contradict — only `escalate`. Also answer whether the objection had grounds in the constitution. JSON: `{ "outcome", "remedy_action", "reasoning", "objection_grounded" }`.

**Equivalence** is checked on machine-comparable fields only: `outcome`, `objection_grounded`, and the `kind` plus normalized payload of `remedy_action`. Free-text `reasoning` is never compared — validators would never agree on prose.

`objection_grounded` stays in the verdict. Court fees are paid by the house wallet when the write is submitted; the Intelligent Contract does not lock or burn GEN.

A principal appeal asks the same question plus `prior_verdict` and `appeal_note`. That is already a second Justice loop, not “we’ll add it later.”

---

## 4. Onboarding — how live agents start walking through us

A prompt does not hold the door. An agent goes to the gateway if (a) it has no direct tool on the card and calendar and (b) the principal configured this without reading OpenAPI.

Onboarding is the principal’s cabinet, not a README. Two tempos on one wizard. Both end with a principal, a constitution, at least one agent that can `propose`, and at least one that can `object`.

### UI languages

Observer and the wizard ship with **five locales from day one**: English (`en`), Spanish (`es`), German (`de`), Turkish (`tr`), Russian (`ru`). Default is the browser language, fallback `en`. A language switcher is visible in the cabinet.

All user-visible copy (labels, buttons, wizard questions, empty states, toasts, `aria-label`) goes through catalogs. Do not hardcode strings in components. Protocol identifiers, JSON fields, and the constitution **text the principal typed** stay as-is — the constitution is not auto-translated.

### Wizard steps (for everyone)

1. **House.** Sign in with your wallet. That opens the house (one wallet, one house). The house gets its own GenLayer treasury; that key pays court fees. The signed-in wallet tops it up.
2. **Constitution, not a blank page.** 5 questions (spend limit, price vs comfort, external promises, whether security can veto mail, when to call the human). Answers assemble into constitution text. It can be edited. Agents later read that text, not the questionnaire.
3. **What we lock.** Kind checkboxes: spend, book, messages. At the hackathon — a sandbox (stub). The principal understands: “the agents’ world is only this.”
4. **Who stands at the door.** See below: your own agent and/or a built-in guardian.
5. **First pass.** Not “you’re all set.” The principal either asks their agent to act, or hits “test the guardian.” A propose appears in the feed, maybe an object and a verdict. Onboarding closes when the inbox is not empty.

Until step 5 happens — the screen shows one next step, not an architecture diagram.

### Two tempos on step 4

**“I already have an agent in chat”** (a barely configured Claude / ChatGPT / Cursor / OpenClaw)

- Choice: where the agent lives. Not “any HTTP,” but four cards + “other.”
- On the card — short copyable steps, not a spec:
  1. Turn off the agent’s direct payments and calendar (one sentence: otherwise it walks around the door).
  2. Paste this MCP URL / this config block. Copy button. A ready snippet per runtime.
  3. Into the system prompt — **not the lock**, a cheat sheet: “actions into the world only through gateway tools; cite the constitution in your justification.” Three lines, also Copy.
  4. Hit “I added it” — the gateway waits for the first `register` or first tool-call and shows “Travel connected.”
- The human gets an **agent key** (token), already written into the copyable config. They do not assemble JSON by hand.

If there is only one agent, there will be no dispute. So on the same step, without jargon: **“Enable a guardian.”** Budget or Security — our reference client that the principal **turns on in their house**. This is not a demo mock and not spawn for the jury. It is the first product “second agent out of the box”: on every tick it reads its inbox with its own agent key and objects when the constitution says so. A person with one travel bot immediately gets a collision.

The guardian is woken by the tick (§3), not by gateway code inside `POST /actions`. It has a key, it has a role, it can be wrong and pay bond — like any other agent.

**“I write agents”** (technician)

- The same door, another tab: `Authorization`, OpenAPI, curl `register` + `propose`, MCP JSON as a file, a Python example.
- Principal sandbox, request logs.
- Not instead of the wizard: they can skip the constitution questions and paste their own text.

### What counts as onboarding success

In one sitting the principal:

- sees their constitution;
- sees their agent green **or** understands which config never arrived;
- sees the guardian enabled (if they have no second agent of their own);
- sees one live case or at least one `propose` in the feed.

Not success: “read the spec in /docs.”

### How this meets spawn

| | Onboarding | Spawn |
|---|---|---|
| Who | A principal who will use the gateway | A guest / judge with no agent at all |
| What it starts | Permanent agents in the house: theirs and/or a guardian | Temporary clients for one run |
| Why | Keep living with the door | Poke the protocol and leave |

The guardian stays in the house after onboarding. Spawn dies after the demo.

---

## 5. Test mode — an extra entrance

The community often has no runtime. The harness only **starts protocol clients**. A case is born from `propose`/`object`, same as a live agent.

| Entrance | What happens |
|---|---|
| Your agent | Main path: register and inbox |
| Test spawn | Starts reference clients (Travel, Budget, …) |
| Replay | Archive of an already finished agent case + tx |
| Human-adapter | Debug the same protocol fields |

On screen: *Test agents speak the same protocol. They are not the product.*

### Reference clients

Write them as real clients. Spawn only launches them for the guest.

**Personal:** Travel, Budget, Calendar, Security.  
**Org:** Sales, Legal, Finance.

At the hackathon a client may be a script or an LLM that reads the constitution and writes a justification. The gateway does not care.

### Guest with no runtime

Spawn creates a throwaway house with its own cabinet link and issues real agent keys to the spawned clients — the same doors, just short-lived. Observer → Spawn on one of the conflicts → register/propose/object in the log → verdict in both inboxes → execute stub and an appeal button visible. Next to it — “Connect your agent” with the spec.

If testnet is down: Replay of a finished run. New deadlocks escalate until the court returns a verdict. Do not invent a local allow, counter, or remedy.

---

## 6. How to go deeper without cutting functions

Not “first two scripts, the rest on day 14.” The scaffold of every row in the §2 table is on the **day-4 public URL**. After that, **quality** grows, not the feature list.

### Day 4 — public v0 (whole system, rough)

Shipped on Vercel. All main protocol calls live behind agent keys. Four court outcomes (offline judge is allowed) with `remedy_action`. Silence → allow, closed by the tick. Ack from engaged parties. Execute stub. Appeal. Bond with `objection_grounded`. Observer. MCP transport plus a copyable config for **one** chat runtime. Onboarding wizard: constitution questions, cabinet link, “enable guardian.” Personal principal. Spawn as a harness. i18n catalogs `en` / `es` / `de` / `tr` / `ru` and a language switcher. Case A runs through agents. A stranger can finish the wizard and see a non-empty inbox — and cannot see anyone else’s house.

### Day 7 — hackathon MVP

Live GenLayer tx on several cases. Remedy and escalate on different constitutions. Cases B / C / D, so `allow_b` is exercised both as a counter-action and as a pure block. Remaining roles (Calendar, Security, org Sales/Legal/Finance) and the remaining runtime cards. External HTTP client completes the loop. Tech tab (OpenAPI / curl). Appeal changes or confirms the outcome. Community checklist passes. This is the version you demo as the hackathon product.

### Day 14 — startup-ready

Same entities, production shape: wallet login already holds the house, Neon Postgres, public landing + cabinet, Vercel production + previews, env/secrets, rate limits and honest errors, cron observability, connect-your-runtime doc, one adapter almost-real and honoring `reversible` (others stub), `escalate_external` in the model without a bridge. Org path feels like a product, not a second demo script.

### After day 14 (depth, not new entities)

Real card/calendar/mail adapters. Money in the bond. Appeal economics. Bridge to an external court. Multi-org. Pin an agent version (a separate idea).

---

## 7. Reference conflicts

Scenarios for agents. Observer shows them as gateway cases. At the hackathon run all four: two personal, one “not money,” one corporate.

Together they cover both shapes of a veto: A and D carry a `counter_action`, C is a pure block, so `allow_b` is exercised in both readings.

### A. Travel vs Budget

Travel: `book`, business class, €420. Budget: object with a `counter_action` — economy €180. Evidence: price, departure, a 9:00 presentation. Constitution: *save money, except being late for work or losing a client*. Good `remedy` candidate: a third `remedy_action` (economy plus a paid seat) that neither side proposed.

### B. Calendar vs Travel

Travel moves a meeting. Calendar: the slot was promised outside. Constitution: *external promises outrank internal convenience*.

### C. Security vs a message

`message` with a spreadsheet. Security: other people’s addresses in the file — a pure block, no `counter_action`. Constitution: *security blocks payment and data, not a restaurant booking*. `allow_b` here means the message is simply not sent; `escalate` if the charter does not reach this case. Holds the Justice track and proves nobody needs a veto-rights table.

### D. Sales vs Legal (org)

Sales: a letter to a client promising a deadline. Legal: object, the promise is wider than the contract. Company constitution. Shows the gateway is not “about trips.”

---

## 8. Work plan

14 days. Goal of each day: **the whole system a little deeper**, not a new isolated feature at the end. Deploy to Vercel continuously; day 4 is the first URL you give to other people.

Do not cut days 1–3 down to “two curls without a court.” Do not leave onboarding as “we’ll write docs.” Without the wizard, only people who already read OpenAPI can open the gateway.

### Days 1–4 — public v0

**Day 1.** Next.js App Router on Vercel (preview). Neon Postgres from the first commit — serverless memory is not state. Protocol types, agent keys, route handlers. Four outcomes with `remedy_action`, offline judge. Observer shell. i18n layer with all five catalogs wired.

**Day 2.** Propose / object / silence / ack / execute stub. `sweep()` behind both the cron route and every read. Guardian as a real protocol client woken by the tick. Wizard: house, cabinet link, constitution from questions, enable guardian. Case A through agents.

**Day 3.** MCP transport (the connection card is only real once it exists) + one runtime card with copyable config and three prompt lines. Spawn harness for guests. Appeal + bond with `objection_grounded`. Empty/error states good enough for a stranger.

**Day 4.** Public access: production (or a stable public preview) on Vercel. Landing that leads into the wizard. Unguessable house ids, agent key on every write, cabinet link for the principal — the URL is public, the houses are not. Smoke the path: open URL → wizard → propose → object → verdict in the feed. Replay if testnet is irrelevant yet. Freeze v0; do not start GenLayer polish until this URL works.

### Days 5–7 — hackathon MVP

**Day 5.** Cabinet first: RainbowKit / SIWE login (same wallet tops up the house), then the house treasury (deposit / withdraw / history). Intelligent Contract on GenLayer Studio-dev (`studioDevnet`). One IC per house, signed by that house's wallet. Live tx on case A. Fees estimated and paid from the house wallet (fee kit). If the court does not return a verdict, `escalate` — no offline judge.

**Day 6.** Cases B / C / D — that is, `allow_b` in both readings and a real `remedy_action`. Remaining roles. Remaining connection cards (Claude / ChatGPT / Cursor / OpenClaw) over the day-3 MCP. Org principal type.

**Day 7.** External client via the tech tab. Onboarding through to a green agent and a non-empty inbox. Community checklist. Recording of a run with a tx. **MVP freeze.**

### Days 8–14 — startup-ready

**Day 8.** Wallet-as-login already shipped. Polish org members and roles — do not invent a second login. Secrets and env on Vercel, not in git.

**Day 9.** Landing, pricing/waitlist stub if needed, cabinet polish. Onboarding copy, and a native-speaker pass over `es` / `de` / `tr` — day 1 shipped drafts, this is where they stop reading like a machine.

**Day 10.** One kind almost-real (adapter still the same interface); others stay stub. This is the day `reversible: false` starts to matter: an irreversible execution must wait for the appeal window. `escalate_external` field in the model.

**Day 11.** Rate limits on public writes, request logs, status page or at least a health route. Cron observability: a missed tick must be visible, not silent. Preview vs production parity.

**Day 12.** “Connect your runtime” doc + tech tab complete. Spawn labeled as harness, not the product.

**Day 13.** Hardening: abuse on public propose, i18n gaps, mobile cabinet, legal/privacy stubs.

**Day 14.** Startup-ready freeze. Prod URL, demo script, checklist from §9 still green.

---

## 9. How the community tests

**Main path:** open **https://foyerapp.dev**. Walk the wizard. A person with one chat agent: paste the config, enable the guardian, see a case. A technician: API tab, the same house.

**Extra:** Spawn / Replay if there is no agent at all.

Checklist:

- Can a person without OpenAPI connect an agent in a few copy-pastes?
- With one own agent, does a dispute still appear (guardian)?
- Does the dispute go through agent calls, not “I am budget” clicks?
- Are all four outcomes visible on different constitutions or cases, including `allow_b` both as a counter-action and as a pure block?
- Does a `remedy` verdict execute from `remedy_action`, without a human reading prose?
- Does an untouched action still resolve when nobody pokes the app — i.e. does the cron tick close the silence window?
- Is there execution (at least a stub) and appeal?
- Is there an on-chain tx? (required for the day-7 MVP; day-4 public v0 may still be offline)
- Does spawn refuse to pass itself off as the product?
- Does the public URL keep state after a reload?
- Does someone else’s house stay invisible without its agent key or the owner’s wallet session?

---

## 10. Stack

- Host: **Vercel**. Git-connected previews; production URL by day 4. Env and secrets on the platform, not in the repo.
- App: Next.js App Router — observer UI + HTTP gateway + MCP HTTP transport (same methods).
- Store: **Neon Postgres** (Vercel Marketplace). Chosen on day 1 so nothing is ever kept in process memory.
- Timers: **Vercel Cron** → `POST /tick`, plus the same `sweep()` on every read. No daemons, no `setTimeout` that a cold start would forget.
- Contract: Python Intelligent Contract on GenLayer testnet (not on Vercel). Deploy key lives in Vercel env, never in git.
- Kind adapters: modules with stubs, one interface for all, each declaring `reversible`; one kind may be almost-real by day 14.
- Reference agents / guardian / spawn: protocol clients with their own agent keys, invoked by a request or a tick.
- Locales: `en`, `es`, `de`, `tr`, `ru`.

---

## 11. Risks

| Risk | What to do |
|---|---|
| Narrow again to one case | §2 checklist — every row in code by the end of day 7; outline already on the day-4 URL |
| No public URL | Day 4 is a hard gate: do not start GenLayer polish until a stranger can open Vercel |
| In-memory store on Vercel | Hosted Postgres from day 1; serverless memory is not state |
| Empty skeleton, “buttons exist” | Each function changes an agent inbox or a lock |
| Website instead of protocol | A case cannot be created from the UI around the API |
| Onboarding = documentation | Wizard with Copy and “I added it”; success = non-empty inbox |
| One agent and silence forever | Guardian enabled in the wizard by default |
| Community with no runtime | Spawn/Replay, not instead of onboarding |
| Testnet is down | Replay of a finished run; new deadlocks `escalate` until the court returns |
| Confused with escrow | Words verdict / evidence / constitution / execute / appeal |
| Hardcoded UI copy | Every string in a catalog; switcher covers all five locales |
| Nothing moves without a click | `sweep()` on cron **and** on every read; missed ticks are visible |
| Gateway objects on the guardian’s behalf | Guardian holds its own key and calls the public endpoint like any client |
| Public URL, open houses | Agent key on writes, wallet session for the principal, unguessable ids from day 4 |
| Verdict nobody can execute | No `remedy` without `remedy_action`; otherwise `escalate` |
| Free-text consensus | Equivalence compares `outcome`, `objection_grounded`, `remedy_action` — never `reasoning` |

---

## 12. Track wording

*Onchain Justice: an agent-native court inside one principal. Agents propose, object and ack through one protocol. GenLayer reads the constitution and evidence and returns allow, remedy or escalate. The gateway executes and the human may appeal. Onboarding is a wizard: constitution from questions, one-click guardian, paste-ready MCP for the agent you already have. Test-agent spawn is only a harness for people with no runtime at all.*

Why not Commerce: there is no deal with a stranger. Why not Governance: a principal’s constitution is executed, not a community vote.
