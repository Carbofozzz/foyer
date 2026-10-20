# Lock — grants on hands

Status: **pilot hands shipped** (2026-10-20). Foyer mints the grant and does not perform the hand. The customer downloads `foyer-lock.mjs`. Git uses the OS git login. Pay: the wallet key is in the OS keychain (`foyer.lock` / `pay.x402`), never in MCP paste; after a yes the program probes HTTP 402, consumes the grant, signs EIP-3009, and settles. Cursor’s terminal is still a second door for git. How to paste: [LOCK-USE.md](LOCK-USE.md). Working notes: `.local/LOCK.md`.

This is **not** a protocol change. The house loop stays [ORCHESTRATE.md](ORCHESTRATE.md): propose → bargain → court or human → `may_act` → `report`. Signatures of Foyer writes stay [SIGN.md](SIGN.md). Court credits stay [BILLING.md](BILLING.md). Hosted agents stay [INITIAL.md](INITIAL.md) backlog. Notify on escalate stays [NOTIFY.md](NOTIFY.md).

**Job:** after a pass, a named hand stays dead until Foyer mints a narrow grant; the hand runs once; the grant dies; the house can revoke the rest and export the journal.

**Not the job:** a second court outcome. Foyer paying or booking. Foyer as a vault of every PAT, mailbox token, and wallet seed. A prompt that says “ask first”. A Cursor-only product.

**Not done** (everything below is in this same plan and is **not** in the code): [list](#not-done).

---

## Why

Building an agent is easy. The same agent often holds a production API key, a mailbox, and files from the outside. One line in a PDF is enough for a “helpful” agent to send a database out.

Lock is the product answer: least privilege, secrets out of the model, untrusted input is not an instruction to the broker, a journal of who did what, and a revoke ready before the fire. In regulated settings (finance, energy, health, critical infrastructure) that journal is also what an incident report can cite. “The agent decided” is not an answer. The model vendor is an ICT supplier when the id is known.

Foyer already decides inside the house. Without Lock, `may_act` does not stop a hand the agent already has.

---

## Without Lock / with Lock

| Piece | Without Lock | With Lock (shipped) |
|---|---|---|
| Pass | `may_act` + `permitted_payload`. The agent still acts with its own tools. | Same pass **mints a grant**. No grant → broker tools refuse. |
| Connect prompt | “Do not act before a pass.” A prompt is not a lock. | Still required. Not the lock. |
| `report` | Ack. Does not revoke a key. | Ack after the hand. Journal row. |
| SIGN | Binds a Foyer write. Does not block GitHub or HTTP 402. | Unchanged. Not a substitute for the PEP. |
| Connect MCP | Protocol tools only. | Protocol MCP (`foyer`) plus local broker (`foyer-lock`). |
| Pay secret | In the agent’s env or a file it can read. | OS keychain. Not MCP paste, not Foyer, not the model. |
| Git secret | OS git login. | Same. Cursor’s terminal can still push. |

---

## Model

One frame for every hand. Only the adapter changes.

| Role | Who | Does |
|---|---|---|
| **PDP** | Foyer | Charter, objectors, court, human. Mints the **grant**. |
| **PEP** | Broker (MCP/HTTP), later an IDE plugin, a host, a CI check, or a payment facilitator | Refuses the hand without a valid consumed grant. |
| **Secret store** | OS keychain, vault, wallet TEE, network token vault | Holds the credential. Not the LLM. Not Foyer Postgres, unless a later slice explicitly takes custody of one hand. |
| **Agent** | The connected assistant | States the intent, talks to Foyer, calls the PEP tool. Never sees the raw secret. |
| **Audit** | Foyer | Intent, grant, invocation, result, report. |

```
Hand         git.push | mail.send | pay.x402 | …
Intent       an action already in the protocol
Grant        short, usually one-shot permission: hand + constraints
Secret       PAT / OAuth / wallet key — outside Foyer DB
Invocation   one push, one settle, one send
AuditEvent   intent / grant / invoke / result / error
```

A grant is not a secret. Example grant: house N, `hand=git.push`, `ref=feat/x`, one use, until 12:00. The secret is what GitHub or the chain actually accepts.

### Invariants

1. The LLM does not receive the secret.
2. No grant → the PEP refuses. It does not warn and continue.
3. Constraints are checked against the actual call. A pass for one ref, amount, or host does not authorize another.
4. The hand moves only after a successful consume. Then the agent `report`s.
5. A second path to the same secret (raw shell, a second client) is a hole. Name it per runtime. Do not pretend it is closed. Git in Cursor’s terminal stays a hole. The payer key must not sit in MCP paste or chat.
6. Foyer does not become the warehouse of every secret. Custody is a later per-hand decision.

---

## Flow

One frame. Pay has an extra probe before consume so a bad 402 does not burn the grant.

```
1. Agent proposes (hand + params + evidence).
2. House loop: collect / object / bargain / insist / court / human.
3. Pass → Foyer mints a grant JWT (no secret inside).
4. Agent calls foyer-lock with that token and the call args.
5. Git: optional HEAD vs commit_sha. Pay: GET the URL, expect HTTP 402,
   match host / amount / asset to the grant. Mismatch → stop, no consume.
6. POST /api/grants/consume. Foyer matches args ⊆ constraints and
   flips active → consumed in one transaction.
7. Only then the PEP loads the secret and runs the hand:
   git → OS git login + git push.
   pay.x402 → read keychain foyer.lock / pay.x402, sign EIP-3009,
   retry with X-PAYMENT / PAYMENT-SIGNATURE.
   pay.ap2 → read keychain foyer.lock / pay.ap2, sign Payment Mandate.
8. Agent reports on the action. Journal records grant / invocation / report.
```

A failed check at 5 or 6 means the hand did not move. Protocol MCP still only talks to Foyer. It does not push or pay.

---

## Decisions

| Topic | Decision |
|---|---|
| Pilot hands | **`git.push` and `pay.x402` together**, one Grant API. Mail, Slack, CRM, `pay.transfer` reuse the same API later. |
| PEP | **MCP broker plus the same calls over HTTP.** Not a Cursor-only extension. |
| Catalog | Document and show every surface (MCP, HTTP, IDE extension, runtime plugin, Hosted, CI gate, facilitator). Shipped code is MCP + HTTP. Other rows are slots marked soon or harder-on-this-runtime. |
| Runtimes | Same set as Connect: Cursor, Claude Desktop, ChatGPT, OpenClaw, custom HTTP. A new MCP client is a paste line, not a new grant protocol. |
| Token | **JWT + mandatory consume.** Asymmetric signature (EdDSA or ES256). Private key only on Foyer. JWKS is published; the broker does **not** verify locally yet — consume is the check. |
| JWT claims | `grant_id`, `action_id`, `agent_id`, `hand`, `constraints`, `exp`, `payload_hash`. No secret. |
| Consume | `POST /api/grants/consume`, idempotent on `grant_id` + `invocation_id`. Args must fit constraints. `uses_remaining` usually 1. |
| Revoke | Status `revoked` in Postgres. The next consume fails even if the JWT is unexpired. |
| Revoke-all | One call revokes live grants for a house or for one agent. Owner (and ops incident path). Alert the owner through the existing notify channel. |
| Audit export | Download of intent / grant / invocation / report, plus model or provider id when the client sent one. This is the journal. A full NIS2/DORA program (regulator filing, every-supplier oversight) is later. |
| Cursor shell | Git: the broker button is locked; Cursor’s built-in terminal can still `git push` with the same login. Copy must say so. Pay: the wallet key lives in the OS keychain, not in MCP paste. |
| OpenClaw / Hosted | The hard lock ships with that runtime: the agent is not given a raw shell that holds the same secret. |
| Court | Grant is a consequence of a pass. Not a new verdict. `deny` mints nothing. |
| Billing | Court credits pay GenLayer. They are not the agent’s payment secret. |

---

## Grant record

| Field | Meaning |
|---|---|
| `grant_id` | id |
| `action_id` | protocol action |
| `principal_id` | house |
| `agent_id` | who it was minted for |
| `hand` | `git.push`, `pay.x402`, … |
| `constraints` | jsonb, schema per hand |
| `expires_at` | TTL |
| `uses_remaining` | usually 1 |
| `status` | `active` \| `consumed` \| `revoked` \| `expired` |
| `decision` | silence \| court \| human \| … |
| `payload_hash` | hash of the permitted payload |

Mint when the action becomes permitted (`may_act`). Do not mint on `deny` or while still bargaining. Expire in `sweep` (same idempotent clock as the rest of the house). No daemon.

### Pilot constraints

| Hand | Constraints | Secret lives | PEP | Hole to name |
|---|---|---|---|---|
| `git.push` | `repo`, `ref`, optional `commit_sha` | OS git login (ssh / helper / keychain) | MCP + HTTP broker | shell `git push` |
| `pay.x402` | host allowlist, `max_per_req`, `max_session`, `asset` | OS keychain `foyer.lock` / `pay.x402`. Never MCP paste, never Foyer, never the model | MCP + HTTP broker | a raw x402 client if the agent can dump the keychain |

Later hands use the same columns: `mail.send`, `slack.post`, `crm.write`, `pay.transfer`, `pay.ap2`, `git.merge_main`, `files.read_exfil`. External mandates (AP2, wallet caps, Agent Pay, an x402 facilitator that requires a Foyer `grant_id`) run **after** this grant. They do not replace the house decision.

---

## PEP catalog

| Surface | What it is | How hard | When |
|---|---|---|---|
| MCP broker | Hand tools beside the protocol MCP. Paste into any MCP client. | The tool is dead without a grant. Git shell is still a hole. Pay key is not in the paste. | **shipped** |
| HTTP / SDK / CLI | Same verify + consume. Scripts, CI, custom agents. | Dead on that client. | **shipped** |
| IDE extension | Cursor, VS Code, JetBrains: broker plus keychain, and shell cuts if the IDE allows them. | Can close the git terminal only when the IDE API allows it. | soon |
| Runtime plugin | OpenClaw, Claude Code, other hosts. Hands exist only as plugin tools. | Hard once the host owns the tool list. | with that host |
| Foyer Hosted | Agent runs on Foyer. Tools are ours. | Hardest honest lock. | Hosted backlog |
| CI gate | `git.merge_main`: required check `foyer-approved`. | Hard on that merge rail. | that hand |
| Facilitator | x402 facilitator or wallet program requires `grant_id`. | Hard on that settle rail. | after the payer broker |
| Mobile / other | Whatever speaks MCP or HTTP. | Same as the row it matches. | when the client exists |

### Honesty badge (cabinet)

| Badge | Meaning |
|---|---|
| `surface` | This tool is locked. Other doors in this app are not. Cursor git is this badge. |
| `host-hard` | This runtime does not hand the agent a second path to the secret. |
| `soon` | Listed so the owner can see it. Not installable yet. |

### Cabinet

1. Connect stays: name the assistant, protocol MCP for propose / object / …
2. Lock sits beside it: enable hands → cabinet returns a **ready broker block** and the HTTP equivalent.
3. Pick the runtime (Cursor / Claude / ChatGPT / OpenClaw / HTTP / …) → short paste steps, not hand-built JSON.
4. Show the honesty badge for that runtime.
5. One rotate kills the protocol key and the broker binding together.

---

## Security bar

| Practice | In Lock |
|---|---|
| Least privilege | Narrow grant. Secret stays out of the model. |
| Vault | Secret store is not chat history and not Foyer Postgres. |
| Untrusted input | PDF, mail, and web may be evidence on the action. The PEP does not follow instructions found inside the hand payload. |
| Audit | Intent, grant, invocation, and report are rows. Export them. |
| Incident | `revoke-all` for the house or one agent, then notify the owner. |
| Model vendor | Store `model` / `provider` on the audit row when the client sends them. |

---

## API (sketch)

Agent routes stay key-named (no principal id in the path). Cabinet routes stay session + house.

| Call | Who | Effect |
|---|---|---|
| mint | server, on pass | Insert grant, return JWT to the proposer inbox / action read. |
| `GET /api/grants/jwks` | public | Verification keys only. |
| `POST /api/grants/consume` | PEP with the agent key | Atomic consume or 409. |
| `POST /api/cabinet/:token/grants/revoke` | owner | One grant, or all live grants for the house or one agent. |
| `GET /api/cabinet/:token/grants/export` | owner (org: a grants/audit section when that grant exists; until then the owner) | Journal download. |

OpenAPI is `0.68.0` while these routes stay as shipped.

Env when the signer lands: `FOYER_GRANT_SIGNING_KEY` (private; comment in `.env.example`). Never the court platform key.

---

## Slices

| Slice | Build | Status |
|---|---|---|
| **L1** | `grants` + audit, mint on pass, JWKS, consume, expire in `sweep` | **done** |
| **L2-git** | MCP + HTTP `git.push` | **done** (Cursor terminal still pushes) |
| **L2-pay** | MCP + HTTP `pay.x402`: 402 probe, consume, keychain, EIP-3009 settle | **done** |
| **L2-ux** | Cabinet hands + ready broker paste + group store | **done** (ready/soon on groups; named `surface` / `host-hard` badges not on each runtime) |
| **L6** | revoke-all, export, owner notify | **done** |
| **L0** | Connect / Lock / guide copy | **done** for shipped surfaces |
| **L3** | Second door | **pay: done** (keychain, not MCP). **git: named hole** (Cursor terminal). Host process has no shell. |
| **L4** | External settle after grant | **done** for x402 exact/EIP-3009 and a local AP2-shaped mandate. Optional grant-gated facilitator. Not a merchant AP2 processor. |

Both pilot hands stay on the same Grant API. Gaps live in [Not done](#not-done), not in the slice cells.

---

## Not done

Same Lock plan. **None of this is in the running product.**

### Grant and broker

- Broker verifying the JWT locally via JWKS **before** `POST /grants/consume`. Today consume on Foyer is the check.
- `max_session` as a running sum across grants. Today each grant is one-shot; both caps apply to that one call.

### Pay rails

- Grant-gated facilitator as the **only** settle path. Today the default is: probe the merchant 402, consume, sign, pay that host.
- Full Google AP2 with a merchant/network (today: a local AP2-shaped Payment Mandate after consume).
- Visa TAP / Trusted Agent Protocol.
- Mastercard Agent Pay.
- Stripe MPP.
- `pay.transfer` (raw chain transfer).
- Foyer-initiated session key / 4337 / Permit2.
- Coinbase Agentic Wallet / CDP caps as the house PEP.

### Surfaces (catalog §9, not built)

- IDE extension (Cursor / VS Code / JetBrains).
- Runtime plugin (OpenClaw / Claude Code host).
- Foyer Hosted (L5).
- A ChatGPT / cloud PEP other than the same MCP paste.
- Network facilitator that **requires** a grant id to settle.
- Mobile / other PEP.

### Hands after the two pilots

- `git.merge_main` (CI “foyer-approved” on merge).
- `mail.send`
- `slack.post`
- `crm.write`
- `files.read_exfil`

### Cabinet honesty

- Named badges `surface` | `host-hard` | `soon` **per runtime**. Today: ready/soon on hand groups, plus a terminal note.

### Compliance

- Full NIS2 / DORA program (regulator report, model-vendor as ICT supplier end-to-end). Revoke-all and journal export are shipped.

### Named hole (will not close)

- Cursor’s built-in terminal can still `git push`. The pay key must not live in a file the agent reads.

---

## Out of scope

- Closing Cursor’s built-in terminal (git). The pay key still must not live in a file the agent reads.
- Storing GitHub PATs, mailbox OAuth tokens, or wallet seeds in Foyer.
- A new court outcome, or the court executing a payment or a push.
- Mixing this with court-credit billing.
- Claiming “the agent cannot push” on a runtime that still has a shell.
