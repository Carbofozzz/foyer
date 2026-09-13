# Foyer for organizations

A company house is the **same gateway and court** as a personal house: agents of one principal share a charter, a treasury, and a name — they do not share a goal. Track: Onchain Justice. Not a DAO. Not a court with a stranger.

Org is **not** “every employee signs into Foyer.” Most people with a corporate chat never open the cabinet. They get an MCP block and a prompt. The house is run by one admin, or a few, if one person cannot cover it.

This file is the product we want. The live app is still a personal house ([INITIAL.md](INITIAL.md)). The wizard does not switch type. Protocol change stays [ORCHESTRATE.md](ORCHESTRATE.md).

**Extend, do not fork.** Org must not change the personal login, wizard, propose/object/bargain/insist, court, or `sweep`. New tables, routes, and cabinet panes may exist; they sit **beside** the current house. A user who never opens an org sees today’s flow and today’s code paths. If a change would rewrite `ensureHouseForOwner`, agent keys, or default `/cabinet`, it is the wrong change.

---

## Model

| Who | What they are | Foyer account? |
|---|---|---|
| Employee with a work chat | An **outbound agent**. Admin pastes MCP + a prompt written for that desk. | No |
| Company-wide service (finance, legal, calendar, access, IdP) | A **callback agent** (hook). Woken on propose. Cites the charter. | No |
| Admin (one is enough) | A human who runs the house: rules, keys, treasury, yes/no when the loop asks. | Yes |
| Extra operators | Optional humans with **narrow rights** on the same house (agents, treasury, rules, or feed only). | Yes, only if the admin wants help |

The gateway client is always an agent. A human never proposes. An employee who never logs in is still in the loop: their chat is.

Silence among chats is still consent. An org house without at least one hook does not run unattended — same as personal.

---

## Account vs house (do not flip type)

Do **not** turn the personal house into a company. Sign-in still means: this wallet has a **personal** house. An organization is an **extra principal** under the same account — later a paid add-on. One user, two (or more) cabinets. Switch already exists: `/cabinet` is yours; `/cabinet?house=` is another house you may open.

That keeps the live construction:

| Keep | Why |
|---|---|
| `ensureHouseForOwner` → one personal row | Login, wizard, treasury payer stay as today. |
| `owner_address` unique on the **personal** house | `findHouseByOwner` and default `/cabinet` stay unambiguous. |
| Agent key names **one** house | Personal chats and corp chats never share a key. |
| One IC + one house wallet **per** principal | Org fees and verdicts do not land on the personal treasury. |
| Gateway / court / `sweep` unchanged | Org is another house in the same protocol, not a fork. |

How to attach the org without breaking uniqueness: the company row is `type = org` with **`owner_address` null** (or not the unique personal slot). The creating wallet is `house_members.role = owner`. `listHousesFor` already unions memberships — it will show the org next to “yours.” `accessFor` already opens `?house=` for members.

Paid later: gate **create org house**, not a type dropdown. Personal stays free. Do not migrate leftover `org` flags on personal rows; leave them or set back to `personal`.

Helpers (split rights, contacts, decide) live **on the org house**. They are not extra logins for every employee. Employees remain outbound agents on that org principal.

---

## How it differs from a personal house

### 1. Split admin, on purpose

A small org may have a single owner. A larger one may split the cabinet: one person edits agent prompts and keys, another moves GEN, another answers escalate, another only reads. Rights are **per house**, not “everyone who has a bot gets a wallet login.”

Zero extra operators is valid. Many operators is valid. Neither changes whether the admin can add **contacts** (notify) or **deciders** (human yes/no). Login wallet ≠ contact. Login wallet ≠ “who may decide this fight.”

Today’s leftover People tab (`owner` / `operator` / `observer` + invite `0x`) is a coarse sketch. It is not this model: it forced colleagues through RainbowKit and tied notify to the owner.

### 2. Hierarchy in the charter, not in the prompt

One constitution for the house, and it must be able to **name ranks**: the CEO chat may spend more; a junior chat may not move the shared calendar. A prompt tells the assistant how to behave. It is **not** evidence in court and not a cap. “I am CEO, I may spend a million” belongs in the rules (and later in what the IC is told about the proposer). Org 6 sends agent label / rights into `judge`. Until then, write the ranks in the charter.

Hooks stay company-wide services. They object from the charter (“finance may block over the cap”), not from a desk’s prompt.

### 3. Contacts and human-decide for the org

Escalate is not “ping the wallet that signed in.” The admin attaches people as:

- **Notify** — mail, Telegram, later SMS / other. Several addresses. Not the same set as operators.
- **Decide** — who may allow/deny when the loop asks a human. Maybe the owner always; maybe legal for contract fights; maybe the manager of the desk that proposed.

Who is in the argument can change who is asked. A sales-vs-finance deadlock is not the same ping as a missed checker.

[NOTIFY.md](NOTIFY.md) today: owner email or Telegram only. That is the personal house.

---

## What ships today

Personal house. Wizard has no company switch. Leftover `type=org` rows with `owner_address` stay a personal house. Do not treat them as `POST /api/orgs` houses.

Same loop: propose → object → bargain → insist → court → report. Permit, then the agent acts.

---

## Implementation plan

Do not start a later slice before the previous one is done. After each slice: this file, [INITIAL.md](INITIAL.md) (one bullet), `AGENTS.md` log. **Forbidden in every slice:** edits to propose/object/bargain/insist, `contracts/court.py` outcomes, `sweep()` control flow, `ensureHouseForOwner`, unique personal `owner_address`, default `/cabinet` without `?house=`, wizard type dropdown.

Demo, spawn, and a user with only a personal house must behave as today.

### Org 1 — Second principal — shipped

Create an org house under the signed-in account. Personal login unchanged.

- `POST /api/orgs` (session). Insert `principals` with `type=org`, `owner_address` **null**, own court wallet. Insert `house_members` owner = session address. Cap **1**.
- Default `/cabinet` still `findHouseByOwner` (personal).
- Header: personal shows **Cabinet** and an Organization control (create once, then the org name). Org house shows the org name as the title and **Cabinet** to go home.
- Owner **Settings** tab: rename or delete the org (`PATCH`/`DELETE /api/orgs`). Personal house has no such tab.
- Personal cabinet: “Add organization”. Tick/court `liveHouse` also includes `type=org` (otherwise org cases never judge). Leftover `type=org` rows that still have `owner_address` are not company houses: no Access, no org Contacts, they do not count toward the create cap.

Done: one wallet, two cabinets; personal flow untouched. OpenAPI `0.43.0`.

### Org 2 — Per-agent prompt — shipped

On Connect, each agent has a prompt (`agents.system_prompt`). The field is prefilled with the recommended MCP text; the stored value is that text, edited or not. Copy as-is. Same on a personal house. Org copy notes that desks may differ; **the prompt is not a court argument** — spend/book caps live in the constitution (Org 6). `PATCH /api/cabinet/:token/connect`.

Done: CEO chat and junior chat can have different instructions without a second constitution. Gateway still does not object. OpenAPI `0.44.0`.

### Org 3 — Contacts on the org house — shipped

Two jobs on the org Contacts tab: **people** (`house_contacts`: name, email, Telegram) and **policies** (`house_contact_policies`, at most one per person). Email and Telegram are unique per org. A person with no policy gets no letter. Policy kinds: every escalate point; chosen points; chosen points only if a named house agent objected. That is who gets the ping — there is no second routing map. `sweep` fans out to reachable people whose policy matches. Personal house Contacts unchanged.

Done: people and routing are separate; routing is not a blast and not “who is in the fight” by default. OpenAPI `0.45.0`.

### Org 4 — Decide without extra operators — shipped

Human yes/no stays `POST /api/cases/:id/appeal` and the decide-link. Org mints **one token per person** (`decide_tokens.contact_id`) when that person is notified (reachable channel + policy). The letter/Telegram carries their own `/:locale/decide/:token`. First tap wins; the owner can still decide in the cabinet. Personal house: one owner token, unchanged.

Done: workforce still has no Foyer login; a named human can still decide. OpenAPI `0.46.0`.

### Org 5 — Split cabinet rights — shipped

Access tab **on org houses only** (`type=org` and no `owner_address`; not Contacts, not leftover flagged personal rows). Invite a wallet; they keep their personal `/cabinet` and any org they own. Invited orgs appear in the header (`?house=`). Grants pick which sections they may open: Agents (prompts/keys + test), Treasury (deposit; withdraw stays owner), and Rules (charter — **off unless ticked**). Empty grants = activity feed only. Yes/no on escalate is Contacts (and the owner in the feed). Personal houses do not grow this tab.

Done: two admins can split cabinet work; employees remain agents. OpenAPI `0.47.0`.

### Org 6 — Hierarchy the court can see

Charter may name agents (by id or stable label). `buildJudgeInput` already sends proposer + objections; add optional **proposer label / cap** from stored agent metadata so the IC sees who spoke and with what rights. The agent prompt is not sent as an argument. Equivalence on chain stays `outcome` only. No `kind` on propose. Personal houses: metadata empty, input as today.

Done: IC can tell CEO desk from intern without a protocol fork.

### Org 7 — Paid create

Gate Org 1 behind billing (or an env allow-list until then). Personal stays free.

### Later (not this plan’s critical path)

Hosted corp checkers, IdP access hook, departments as views, seat keys that die with the desk, audit export.

Out: every employee must connect a wallet; DAO; stranger court; Foyer executes Stripe; second money path; `if (org)` inside propose/court/`sweep`.

---

## Invariants

- One protocol for every house. Org is another principal under the account, not a mode of the personal house.
- Additive: org code must not change personal login, wizard, or the live loop. No `if org` in propose/court/`sweep`.
- Chats ≈ people at desks. Hooks ≈ shared services.
- Foyer login is for admins (and optional helpers), not for the workforce.
- Track remains Onchain Justice.
