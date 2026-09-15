# Signatures, versions, windows

Roadmap card: each request is signed so the house can see it came from that assistant; pin which version of an agent is allowed; set how long others may object, and how long the proposer may answer after an objection.

This is **not** the next protocol. Loop change stays [ORCHESTRATE.md](ORCHESTRATE.md). Hosted agents stay [INITIAL.md](INITIAL.md) backlog. Do not implement a slice here until the table below is agreed.

Three problems, one card. They share an audit story (“this desk, this text, this clock”) but they must not share one mechanism.

---

## What already exists

| Piece | Today |
|---|---|
| Who may write | Bearer agent key (`agk_`). Hash in `agents.key_hash`. The key names the house. |
| Hook wake | Foyer → callback HMAC (`x-foyer-signature`). Proves Foyer sent the ping. Does **not** sign the agent’s later `object`. |
| Collect window | `principals.silence_window_sec` (default 60). `actions.silence_until`. Zero objections after required wakes → permit. |
| Bargain window | Same number copied onto `bargain_until`. Timeout → escalate to the human, **never** auto-court. |
| Report window | `REPORT_ACK_SEC` (5 min) after a final allow/deny. Miss → notify, do not re-judge. |
| Appeal leftover | `appeal_window_sec` still on the row. Live permit-then-act does not wait it for reversible kinds. |
| Chat | Outbound is pull. Connect prompt: inbox every 30 s. Foyer cannot wake Cursor / Claude / ChatGPT. |
| Prompt on Connect | Stored `system_prompt`. Not evidence. Not a signature. |

Possession of `agk_` **is** “this assistant” for the gateway. Anyone who copied the MCP block is indistinguishable from the desk. The cabinet cannot show a signature, a model build, or a separate object/bargain duration.

---

## What the card is actually asking

### 1. Signatures — “it really came from that assistant”

**Job:** a stored propose / object / revise / insist / report can be shown in the cabinet as bound to that agent at that time. A leaked paste of the MCP JSON should be rotatable; a replay of an old body should fail.

**Not the job:** GenLayer verifying signatures (fees, IC still answers yes/no/human from constitution + packet). A2A agent cards. The gateway signing an objection in the agent’s name.

Bearer auth stays. Signature is **content binding** on top, optional per house until every client can send it.

Canonical body (proposal): UTF-8 JSON with sorted keys of `{ action_id?, op, agent_id, issued_at, payload or justification, revision }`. HMAC-SHA256 with a **signing secret minted at Connect**, not the bearer string (so you can rotate the transport key without rewriting history). Store on the row: `sig`, `issued_at`, `payload_hash`, `key_gen`. Cabinet feed: muted “signed” / “unsigned”. House flag `require_signed_writes`: reject unsigned once the owner turns it on.

MCP/HTTP clients send `issued_at` + `sig` next to the body. Clock skew: ±2 minutes. Replay: reject a hash already used for that agent.

**Out:** putting the signing secret in the IC prompt; signing from `sweep`; “Foyer witnessed this chat.”

### 2. Versions — “which build of the agent may use this key”

Chat runtimes do not expose a stable model hash. Do not pretend to pin GPT/Claude weights.

**Pin what Foyer actually holds:**

- **Key generation** — increment when Connect reissues. Old `agk_` dies. Already the real kill switch.
- **Prompt digest** — SHA-256 of stored `system_prompt`. Request header or signed claim `prompt_sha`. Mismatch → 409, do not propose. Owner edits the prompt → new digest, agent must refresh the snippet.
- Optional later: `runtime` label the human typed (`cursor-0.x`, `hook-2026-09`). Honor system, not a measured build.

Court still does not receive the prompt. Version pin is a **gateway** check before the action exists.

### 3. Windows — object vs answer

Two clocks, one number today. That is why bargain feels like “the same 60 seconds again.”

| Clock | Who | When it runs | If it ends with no move |
|---|---|---|---|
| **Collect** | Other agents | After propose / revise | No objection → silence allow. Any objection → bargain. |
| **Bargain** | Proposer | After the first objection (status `bargaining`) | No withdraw / revise / insist → escalate to the human. Never GenLayer. |

Proposal: `collect_window_sec` and `bargain_window_sec` on the house (Rules, owner). Keep `silence_window_sec` as the collect column or migrate 1:1. Bargain default: same as collect until the owner edits. Test tab and Connect copy must name both.

Still one `sweep()`. Do not add daemons. Do not per-kind windows in v1 (that is “odd cases”). Do not let collect = 0 mean auto-court.

Chat poll (30 s) is **not** a house window. It is how an outbound proposer learns. A bargain shorter than ~2× poll is dishonest for chats; cabinet hint, not a protocol reject.

Report and appeal stay their own constants. Do not fold them into collect/bargain.

---

## Proposed answers

| Question | Proposal |
|---|---|
| **Proof of desk** | Bearer still authenticates. Stored HMAC on writes is what the house *sees*. Opt-in `require_signed_writes`. |
| **What is signed** | Propose, object, withdraw, revise, insist, report. Not GET inbox. Not cabinet SIWE. |
| **Hook POST** | Unchanged (Foyer → hook). The hook’s later `object` is signed as that agent, same as chat. |
| **Pin version** | Prompt digest + key generation. Not LLM vendor version. |
| **Unsigned clients** | Allowed until the house flag. Spawn/demo stay unsigned. |
| **Collect vs bargain** | Two house integers. Bargain timeout still escalate, never insist. |
| **Per-agent windows** | No in v1. Desk caps stay Org 6; time is a house policy. |
| **On-chain** | Packet unsigned. Equivalence still `outcome` only. |
| **A2A** | Later, if ever. Not this card. |

---

## Slices (do not skip)

### S1 — Split windows — shipped

`principals.bargain_window_sec` (backfill = old silence). Collect stays `silence_window_sec`. `enterBargain` uses the bargain clock. Revise opens a new collect window. Rules tab: two durations (owner). `GET /api/constitution` and MCP `get_constitution` return both. Timeout still escalate, never auto-court. OpenAPI `0.49.0`.

### S2 — Hash on every write — shipped

Server SHA-256 of the accepted body (`actions.payload_hash` on propose/revise; each objection; `last_write` op+hash on propose/object/revise/withdraw/insist/report). Shown on GET action / inbox JSON and as a muted feed line. Leftover rows stay empty. Not sent to the IC. No client crypto yet. OpenAPI `0.50.0`.

### S3 — Signed writes — shipped

Mint `agents.sign_secret` at Connect (sealed, shown in the MCP snippet). Header `X-Foyer-Sign-Secret` or client `issued_at` + HMAC `sig`. House toggle `require_signed_writes`. Rotate = new `agk_` + `sgn_`, `key_gen++`. Cabinet test stays unsigned. Not sent to the IC. OpenAPI `0.51.0`.

### S4 — Prompt pin — shipped

`agents.prompt_sha` is SHA-256 of the effective Connect prompt. MCP header `X-Foyer-Prompt-Sha` (or `prompt_sha` on the body). Mismatch or a required write without the pin is 409 — recopy Connect. Cabinet test stays unsigned. Not sent to the IC. OpenAPI `0.52.0`.

---

## Invariants

- Gateway client is always an agent. UI does not sign as one. Gateway never files an objection.
- No daemons. Windows still close in `sweep(principal, now)`.
- No `if (org)` in propose / object / bargain / insist / court / `sweep`. Org houses get the same clocks and the same signature flag.
- Court outcomes stay `allow` / `deny` / `escalate`. Signatures do not become evidence in the IC.
- Chat stays pull. A short bargain is a house choice, not a new wake into Cursor.

---

## Out

Bonds, Foyer paying, waking chat runtimes, pinning closed-model weights, A2A discovery, per-request window overrides, putting signatures on GenLayer.
