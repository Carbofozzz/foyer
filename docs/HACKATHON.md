# Intra-Principal Court

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

The hackathon shows the **outline of the product**, not one happy path. Every function in the idea must exist in code at least as a skeleton: an endpoint, an object, a behavior, a place in the UI. Production depth is optional.

### Must work in substance

| Function | At the hackathon | Grows into |
|---|---|---|
| Agent protocol | register, constitution, propose, object, inbox, ack | Signatures, A2A, foreign runtimes |
| Silence window | No object in N seconds → allow without court | Policy by kind / amount |
| Court: 4 outcomes | `allow_a` / `allow_b` / `remedy` / `escalate` in the contract | Richer remedy, partial allow |
| Evidence | Text, links, stub attachments in the case packet | Live calendar, receipt, email |
| Verdict execution | Adapter `spend` / `book` / `message` / `cancel`: log + stub “executed” | Real card, calendar, mail APIs |
| Ack | Gateway does not lift the lock until both agents ack (or timeout) | Penalty for ignore |
| Principal appeal | `POST /cases/:id/appeal` → re-trial or manual outcome | Bond, window, cost |
| Bond for object | Symbolic agent balance, burns on a clearly empty veto | Real stables |
| Several roles | Personal: Travel, Budget, Calendar, Security. Org: Sales, Legal, Finance | Arbitrary principal roles |
| Two principal types | Personal and corporate constitution | Multi-org, teams |
| MCP | Tools = the same protocol methods | Catalog, foreign clients |
| External agent | Spec + sandbox + one live third-party client (script / GPT tools / any HTTP) | OpenClaw, A2A discovery |
| Observer | Gateway mirror: agents, inbox, cases, verdicts, execution, appeals | Principal cabinet |
| Onboarding | Wizard: charter from questions, one-click guardian, connect your agent by runtime | Card/calendar OAuth, guardian store |
| UI locale | `en`, `es`, `de`, `tr`, `ru` catalogs; no hardcoded copy; language switcher | More locales, RTL |
| On-chain | At least some cases on GenLayer, tx on the verdict | Mainnet, bridge to an external Internet Court |

### Test mode (not the core)

Spawn test agents and Replay — so the community with no runtime can open the same protocol. They do not replace the functions above and they do not go to court around the API.

### Do not promise as finished reality

- Live access to a bank, Gmail, calendar (at the hackathon — adapter interface + stub).
- Legal force of a verdict in the outside world.
- A full Internet Court / escrow with a stranger (a different product; leave only an `escalate_external` field for later).
- Teaching agents to “get along” in chat instead of going to court.

In other words: **the adapter exists; the wire to the bank comes later**. Court, gateway, outcomes, appeal, MCP — already here.

---

## 3. Root architecture

The gateway client is always an agent. There is no separate path “the website created a case.”

```
  Agent A          Agent B          Agent C …
  HTTP / MCP / test spawn / human-adapter
           │
           ▼
     Agent Protocol
  register · propose · object
  inbox · ack · appeal (principal)
           │
           ▼
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

### Protocol

| Call | Who | Meaning |
|---|---|---|
| `POST /agents` | agent | Register: id, role, callback or poll |
| `GET /constitution` | agent | Principal’s constitution |
| `POST /actions` | agent | Action + justification + evidence |
| `POST /actions/:id/objections` | agent | Veto + justification + evidence + bond |
| `GET /inbox` | agent | Other agents’ actions, deadlines, verdicts |
| `POST /actions/:id/ack` | agent | Accepted the outcome, ready for execute |
| `GET /actions/:id` | agent | Lock / court / execution status |
| `POST /cases/:id/appeal` | principal | Re-trial or manual override |

MCP: the same tool names. The human-adapter sends the same JSON. Test spawn starts processes that call the same URLs.

`kind`: `spend`, `book`, `message`, `cancel`. Execute is `adapters[kind].apply(verdict, action)`. At the hackathon each adapter writes a structured log (`would_charge`, `would_book`, …). The interface is already the one that stays for real APIs.

### Objects

| Object | Why |
|---|---|
| `Principal` | Constitution, type `personal` / `org`, appeal window |
| `Agent` | Party, role, bond balance |
| `Action` | Proposal, kind, payload, evidence |
| `Objection` | Veto, evidence, bond |
| `Case` | Constitution snapshot, parties, status |
| `Verdict` | outcome, remedy, reasoning, judge (`onchain`/`offline`), tx, appeal_of |
| `Execution` | kind, stub result, timestamp |

### Question to validators

> Given constitution, proposed_action, objection, and evidence. Which decision best executes the constitution: `allow_a`, `allow_b`, `remedy`, or `escalate`? If `remedy` — a concrete compromise in one or two sentences. If the constitution is silent or articles contradict — only `escalate`. JSON: `{ "outcome", "remedy", "reasoning" }`.

Equivalence: `outcome` and the meaning of `remedy`. Reasoning may differ.

A principal appeal asks the same question plus `prior_verdict` and `appeal_note`. That is already a second Justice loop, not “we’ll add it later.”

---

## 4. Onboarding — how live agents start walking through us

A prompt does not hold the door. An agent goes to the gateway if (a) it has no direct tool on the card and calendar and (b) the principal configured this without reading OpenAPI.

Onboarding is the principal’s cabinet, not a README. Two tempos on one wizard. Both end with a principal, a constitution, at least one agent that can `propose`, and at least one that can `object`.

### UI languages

Observer and the wizard ship with **five locales from day one**: English (`en`), Spanish (`es`), German (`de`), Turkish (`tr`), Russian (`ru`). Default is the browser language, fallback `en`. A language switcher is visible in the cabinet.

All user-visible copy (labels, buttons, wizard questions, empty states, toasts, `aria-label`) goes through catalogs. Do not hardcode strings in components. Protocol identifiers, JSON fields, and the constitution **text the principal typed** stay as-is — the constitution is not auto-translated.

### Wizard steps (for everyone)

1. **House.** Create a principal. No wallet. Name, personal / org.
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

If there is only one agent, there will be no dispute. So on the same step, without jargon: **“Enable a guardian.”** Budget or Security — our reference client that the principal **turns on in their house**. This is not a demo mock and not spawn for the jury. It is the first product “second agent out of the box”: it watches the inbox and vetoes against the constitution. A person with one travel bot immediately gets a collision.

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

Observer → Spawn on one of the conflicts → register/propose/object in the log → verdict in both inboxes → execute stub and an appeal button visible. Next to it — “Connect your agent” with the spec.

If testnet is down: Replay of a real run + `judge: offline` on new runs. Do not lie to the agent that offline is consensus.

---

## 6. How to go deeper without cutting functions

Not “first two scripts, the rest after the hackathon.” The scaffold of every row in the §2 table, immediately. After that, **quality** grows, not the feature list.

### Pass 1 — the whole system, rough

All main calls live. Four court outcomes. Silence → allow. Ack. Execute stub. Appeal. Bond as a number. MCP wrapper. Observer. Onboarding wizard: constitution questions, copyable config for one chat runtime, “enable guardian” button. Two principals (me / company). Spawn as a harness. Contract on GenLayer, or offline with the same JSON until deploy lands. UI: i18n layer + complete `en` / `es` / `de` / `tr` / `ru` catalogs and a language switcher.

The jury already sees a product, not a one-button prototype.

### Pass 2 — court and agents are convincing

Live tx on several cases. Remedy and escalate on different constitutions. A case that is not about money (Security). An external HTTP client completes the loop. The execution log reads as “the gateway decided and would have done it.” Appeal changes or confirms the outcome.

### Pass 3 — future contours visible in code

An adapter with an explicit TODO for calendar/card (one kind can be almost-real, the rest stub). `escalate_external` in the model without a bridge implementation. A second org conflict, Sales vs Legal. A document “how to connect OpenClaw / your runtime.”

### After the hackathon (depth, not new entities)

Real adapters. Money in the bond. Appeal economics. Bridge to an external court. Multi-org. Pin an agent version (a separate idea).

---

## 7. Reference conflicts

Scenarios for agents. Observer shows them as gateway cases. At the hackathon run all four: two personal, one “not money,” one corporate.

### A. Travel vs Budget

Travel: `book`, business class, €420. Budget: object, economy €180. Evidence: price, departure, a 9:00 presentation. Constitution: *save money, except being late for work or losing a client*. Remedy possible.

### B. Calendar vs Travel

Travel moves a meeting. Calendar: the slot was promised outside. Constitution: *external promises outrank internal convenience*.

### C. Security vs a message

`message` with a spreadsheet. Security: other people’s addresses in the file. Constitution: *security blocks payment and data, not a restaurant booking*. `allow_b` or `escalate`. Holds the Justice track.

### D. Sales vs Legal (org)

Sales: a letter to a client promising a deadline. Legal: object, the promise is wider than the contract. Company constitution. Shows the gateway is not “about trips.”

---

## 8. Work plan

The goal of each day is **the whole system a little deeper**, not a new isolated feature at the end.

**Day 1.** Protocol + gateway + four outcomes (at least offline) + clients + silence/ack + execute stub + observer. Wizard: house, constitution from questions, “enable guardian.” Case A already runs through agents. UI catalogs `en` / `es` / `de` / `tr` / `ru` and a language switcher.

**Day 2.** GenLayer and tx. Connection cards for Claude / ChatGPT / Cursor / OpenClaw (copyable MCP + three prompt lines). Remaining roles and cases B/C/D. Appeal, bond. Spawn for guests with no agent.

**Day 3.** External client via the tech tab. Onboarding through to a green agent and a non-empty inbox. Replay. Community checklist. Recording of a run with a tx.

Do not cut day 1 down to “two curls without a court.” Do not leave onboarding as “we’ll write docs.” Without the wizard, only people who already read OpenAPI can open the gateway.

---

## 9. How the community tests

**Main path:** walk the wizard. A person with one chat agent: paste the config, enable the guardian, see a case. A technician: API tab, the same house.

**Extra:** Spawn / Replay if there is no agent at all.

Checklist:

- Can a person without OpenAPI connect an agent in a few copy-pastes?
- With one own agent, does a dispute still appear (guardian)?
- Does the dispute go through agent calls, not “I am budget” clicks?
- Are all four outcomes visible on different constitutions or cases?
- Is there execution (at least a stub) and appeal?
- Is there an on-chain tx?
- Does spawn refuse to pass itself off as the product?

---

## 10. Stack

- Contract: Python Intelligent Contract, GenLayer testnet.
- Gateway: HTTP + MCP over the same methods.
- Reference agents: separate API clients.
- Kind adapters: modules with stubs, one contract for all.
- Observer: principal cabinet over the gateway. Locales `en`, `es`, `de`, `tr`, `ru`.
- Spawn: start the same clients with test keys.

---

## 11. Risks

| Risk | What to do |
|---|---|
| Narrow again to one case | §2 checklist — every row in code by the end of day 2 |
| Empty skeleton, “buttons exist” | Each function changes an agent inbox or a lock |
| Website instead of protocol | A case cannot be created from the UI around the API |
| Onboarding = documentation | Wizard with Copy and “I added it”; success = non-empty inbox |
| One agent and silence forever | Guardian enabled in the wizard by default |
| Community with no runtime | Spawn/Replay, not instead of onboarding |
| Testnet is down | Replay + honest `judge: offline` |
| Confused with escrow | Words verdict / evidence / constitution / execute / appeal |
| Hardcoded UI copy | Every string in a catalog; switcher covers all five locales |

---

## 12. Track wording

*Onchain Justice: an agent-native court inside one principal. Agents propose, object and ack through one protocol. GenLayer reads the constitution and evidence and returns allow, remedy or escalate. The gateway executes and the human may appeal. Onboarding is a wizard: constitution from questions, one-click guardian, paste-ready MCP for the agent you already have. Test-agent spawn is only a harness for people with no runtime at all.*

Why not Commerce: there is no deal with a stranger. Why not Governance: a principal’s constitution is executed, not a community vote.
