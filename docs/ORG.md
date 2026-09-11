# Foyer for organizations

A company house is the **same gateway and court** as a personal house: agents of one principal share a charter, a treasury, and a name — they do not share a goal. Track: Onchain Justice. Not a DAO. Not a court with a stranger.

Org is **not** “every employee signs into Foyer.” Most people with a corporate chat never open the cabinet. They get an MCP block and a prompt. The house is run by one admin, or a few, if one person cannot cover it.

This file is the product we want. The live app is still a personal house ([INITIAL.md](INITIAL.md)). The wizard does not switch type. Protocol change stays [ORCHESTRATE.md](ORCHESTRATE.md).

---

## Model

| Who | What they are | Foyer account? |
|---|---|---|
| Employee with a work chat | An **outbound agent**. Admin pastes MCP + a prompt written for that desk. | No |
| Company-wide service (finance, legal, calendar, access, IdP) | A **callback agent** (hook). Woken on propose. Cites the charter. | No |
| Admin (one is enough) | A human who runs the house: rules, keys, treasury, yes/no when the loop asks. | Yes |
| Extra operators | Optional humans with **narrow rights** on the same house (prompts, treasury, decide, read). | Yes, only if the admin wants help |

The gateway client is always an agent. A human never proposes. An employee who never logs in is still in the loop: their chat is.

Silence among chats is still consent. An org house without at least one hook does not run unattended — same as personal.

---

## How it differs from a personal house

### 1. Split admin, on purpose

A small org may have a single owner. A larger one may split the cabinet: one person edits agent prompts and keys, another moves GEN, another answers escalate, another only reads. Rights are **per house**, not “everyone who has a bot gets a wallet login.”

Zero extra operators is valid. Many operators is valid. Neither changes whether the admin can add **contacts** (notify) or **deciders** (human yes/no). Login wallet ≠ contact. Login wallet ≠ “who may decide this fight.”

Today’s leftover People tab (`owner` / `operator` / `observer` + invite `0x`) is a coarse sketch. It is not this model: it forced colleagues through RainbowKit and tied notify to the owner.

### 2. Hierarchy in the charter and in prompts

One constitution for the house, but it must be able to **name ranks**: the CEO chat may spend more; a junior chat may not move the shared calendar. Per-agent **prompts** (and later, per-agent clauses the court can see) carry that split. A single paste for every Cursor seat is the personal-house cheat sheet — wrong for org.

Hooks stay company-wide services. They object from the charter (“finance may block over the cap”), not from a desk’s prompt.

### 3. Contacts and human-decide for the org

Escalate is not “ping the wallet that signed in.” The admin attaches people as:

- **Notify** — mail, Telegram, later SMS / other. Several addresses. Not the same set as operators.
- **Decide** — who may allow/deny when the loop asks a human. Maybe the owner always; maybe legal for contract fights; maybe the manager of the desk that proposed.

Who is in the argument can change who is asked. A sales-vs-finance deadlock is not the same ping as a missed checker.

[NOTIFY.md](NOTIFY.md) today: owner email or Telegram only. That is the personal house.

---

## What ships today

Personal house. Wizard has no company switch. Leftover `org` rows still show People (wallet invites). Do not grow that tab until it matches this file.

Same loop: propose → object → bargain → insist → court → report. Permit, then the agent acts.

---

## Build order (when we pick org up)

Keep tools-and-keys. No UI-opened cases. Gateway never objects.

### First slice

- House flag `org` (admin-only or ops), not a confusing wizard dropdown.
- **Per-agent prompt** in Connect (stored, copyable). Different desks, different limits in the text the model sees.
- **Contacts list** separate from login: add emails / Telegram for notify. Operators optional.
- Human-decide still works with **one** admin and **no** extra operators.

### Next

- Configurable cabinet rights (edit prompts / treasury / decide / read) instead of three fixed roles.
- Charter clauses the court can apply **per proposer** (spend cap by agent, who may book). Propose stays without `kind`; identity is the agent key.
- Route escalate: notify set vs decide set; optional “this fight → this person.”
- Audit export.

### Later

- Hosted corp checkers ([INITIAL](INITIAL.md) hosted backlog).
- Access hook to IdP.
- Departments as views, not a second gateway.
- Seat keys that die when the desk is removed — employees still never need a Foyer login.

Out: every employee must connect a wallet; DAO votes; a court with a counterparty; Foyer executing Stripe; a second money path.

---

## Invariants

- One house, one treasury, one court IC. Org adds who **runs** the house and how **agents** are labeled, not a second protocol.
- Chats ≈ people at desks. Hooks ≈ shared services.
- Foyer login is for admins (and optional helpers), not for the workforce.
- Track remains Onchain Justice.
