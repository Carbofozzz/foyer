# How Lock runs

Index: [README](../README.md). Operator guide for the shipped broker. The build plan is [LOCK.md](LOCK.md). Protocol paste stays [CONNECT.md](CONNECT.md). The customer-facing store of steps is `/:locale/guide`.

Foyer decides and keeps the journal. The customer does two things: a text so the bot asks Foyer, and a broker on their computer that holds access and releases it only after a yes. The ready broker is the program `foyer-lock.mjs`. A plugin and an editor extension are catalog slots, not shipped. Git and payment each have their own steps on that page.

Two pastes. The Foyer MCP server decides. A local broker performs `git push` or the x402 call, and only after Foyer has consumed a one-shot grant.

Foyer does not store the GitHub credential, the wallet key, or the payer secret. Nobody pastes those into the cabinet, into `foyer-lock.mjs`, or into the MCP block. The program only runs after a consumed grant; it then uses whatever login already exists on that computer.

### Git

The person logs into git on that computer the usual way, **before** the bot ever asks: `ssh` key, `gh auth login`, OS keychain, or git’s credential helper. That material stays in the OS / ssh-agent / helper. The broker never reads a PAT from a file Foyer issued. After a yes it runs `git push` in `FOYER_LOCK_GIT_CWD` (or the process directory). Git uses the same login the person already has. If that computer cannot push by hand, the broker cannot either.

### Payment (`pay.x402`)

The person puts a funded USDC wallet key in the **OS keychain**, not in the MCP block. Service `foyer.lock`, account `pay.x402`. On a Mac, in their own Terminal (not the bot’s): `security add-generic-password -U -s foyer.lock -a pay.x402 -w '0x…'`. On Linux: `secret-tool store --label 'Foyer pay.x402' service foyer.lock account pay.x402`. Foyer never stores it. The program reads it from the keychain only.

Order after a yes: if the keychain entry is missing, stop. Otherwise probe the URL (expect HTTP 402) → match host / amount / asset to the grant → verify the JWT against `GET /api/grants/jwks` → consume → sign EIP-3009 from the keychain → retry with the payment header. That is the payment. The program pays that host. A site that does not answer 402 is not paid. A mismatch does not consume. `max_session` sums this agent’s payments for that asset inside the grant TTL. The bot does not see the key in chat or in MCP paste.

### Checkout signature (`pay.ap2`)

Off until the owner ticks it. The person stores the signing key in the OS keychain as `foyer.lock` / `pay.ap2`. Foyer never stores it. After consume the program signs on that machine.

---

## Once, on the server

Set `FOYER_GRANT_SIGNING_KEY` in `.env.local` or on Vercel. It is a 32-byte Ed25519 seed, base64url. The generate command is in `.env.example`.

Foyer signs grants with that key. It is not a GitHub token and it is not the court platform key (`GENLAYER_PLATFORM_KEY`).

Optional `FOYER_GRANT_TTL_SEC` (default 900). A grant dies after that even if nobody consumed it.

Public verification keys: `GET /api/grants/jwks`. The private seed never leaves the server.

If the key is missing, a proposal that names a hand returns 503 when the house permits it. A proposal with no `hand` still permits the old way and mints nothing.

---

## What you paste

Cabinet → Connect. Two blocks.

### 1. Protocol MCP (`foyer`)

The existing MCP block. Cursor: Settings → MCP. Same for Claude, ChatGPT, and OpenClaw. URL is `{origin}/api/mcp`, bearer `agk_…`.

That server proposes, objects, reads inbox, withdraws, revises, insists, and reports. It does not push and it does not pay.

Paste the Connect prompt into the chat. When `may_act` is true and `grant.token` is set, git push and x402 go only through the `foyer-lock` tools with that token.

### 2. Lock program (`foyer-lock`)

The same paste. `foyer` is Foyer. `foyer-lock` is a program on the customer's computer. Download it from the cabinet (`GET /api/lock-broker`, saved as `foyer-lock.mjs`) into the folder the chat has open. Node starts it. Foyer does not run it and does not hold the git password or the payer key.

```json
{
  "mcpServers": {
    "foyer-lock": {
      "command": "node",
      "args": ["foyer-lock.mjs"],
      "env": {
        "FOYER_URL": "https://your-host",
        "FOYER_AGENT_KEY": "agk_…",
        "FOYER_LOCK_HANDS": "git.push,pay.x402"
      }
    }
  }
}
```

The ticks in the cabinet rewrite `FOYER_LOCK_HANDS`. Without a consumed grant the program refuses the push and the payment. `node foyer-lock.mjs --http` listens on `127.0.0.1:8788` (`POST /call`, `GET /tools`) for a client that does not use MCP.

`FOYER_LOCK_GIT_CWD` is the directory that program's `git push` uses. Unset means its working directory.

`FOYER_LOCK_DRY=1` consumes the grant and does not run `git` or pay.

The payer wallet is **not** an env var in the paste. Store it in the OS keychain (`foyer.lock` / `pay.x402`). Fund it with USDC on the network the 402 names (usually Base or Base Sepolia). Do not run a facilitator. The program pays the host that returned 402.

Cursor’s built-in terminal can still `git push` with the same git login. The cabinet says so. That door is not closed.

Check the hands the house may grant: `git push`, x402, and an AP2 checkout mandate. `pay.ap2` starts off. A pass for a hand that is off mints no token, so the broker has nothing to consume.

`scripts/lock-host.mjs` is the same tools with no shell, for a host that owns the tool list. The cabinet does not paste it. It does not close Cursor’s terminal.

---

## What the agent sends

Through the protocol MCP, `propose`. The payload must name the hand and the limits. No `hand` means no grant.

Git:

```json
{
  "summary": "push feat/x",
  "hand": "git.push",
  "constraints": {
    "repo": "git@github.com:acme/app.git",
    "ref": "feat/x"
  }
}
```

Optional `constraints.commit_sha`. If it is set, the later call must carry the same sha.

x402:

```json
{
  "summary": "pay the API",
  "hand": "pay.x402",
  "constraints": {
    "hosts": ["api.example"],
    "max_per_req": 2,
    "max_session": 5,
    "asset": "USDC"
  }
}
```

`hosts` are lowercase hostnames. Amounts are numbers. Unknown extra fields on the later call are ignored. They are not instructions to the broker.

---

## What happens

```
agent  --propose-->  Foyer MCP /api/mcp
house  --silence | bargain | court | human-->  permitted
Foyer  --mint-->  grants row + grant.token on the proposer’s inbox
agent  --git_push | pay_x402-->  local foyer-lock
broker --probe 402 / HEAD sha-->
broker --POST /api/grants/consume-->  Foyer
Foyer  --409 or consumed-->
broker --only if consumed-->  git push | EIP-3009 + paid retry
agent  --report-->  Foyer MCP
```

Until the action is permitted, the broker has nothing to consume, so it does not run the hand.

On permit, if `hand` is `git.push` or `pay.x402`, Foyer inserts `grants` and returns `grant.token` on inbox and `get_action` to the proposer only. The token is a JWT: agent, hand, constraints, expiry, payload hash. No secret inside. Other agents in the house see the grant metadata, not the token.

`deny` permits nothing and mints nothing.

---

## The consume call

The broker sends:

`POST {FOYER_URL}/api/grants/consume`

`Authorization: Bearer agk_…`

```json
{
  "grant": "<jwt>",
  "invocation_id": "inv_…",
  "args": { "repo": "…", "ref": "…" },
  "model": "",
  "provider": ""
}
```

The broker checks the JWT against `GET /api/grants/jwks` before it calls consume. A bad signature, the wrong hand, or an expired token never reaches consume. Foyer then checks the signature again, that the token belongs to this agent, and that `args` fit the constraints. A different `ref`, host, or asset is 409. `max_per_req` caps this call. `max_session` is the sum of this agent’s `pay.x402` amounts in the grant TTL window (default 15 minutes) for that asset; over the sum is 409 and the row stays `active`. The broker does not run `git` or pay.

A match flips the row to `consumed` in one update. A second call with another `invocation_id` is 409. The same `invocation_id` returns the same success and does not push again.

`model` and `provider` are stored on the journal row when the client sends them.

After a successful consume the broker runs:

- `git_push` → `git push <repo> <ref>`. If `commit_sha` is set, the broker compares it to `git rev-parse HEAD` before consume. A mismatch does not consume and does not push.
- `pay_x402` → probe HTTP 402, match the challenge to the grant, verify the JWT, consume, read the payer key from the OS keychain, sign EIP-3009, retry with `X-PAYMENT` / `PAYMENT-SIGNATURE` on that host.
- `sign_ap2` → after consume, signs an AP2 Payment Mandate `{ checkout_hash, amount, asset, issued_at, exp }` with the keychain item `foyer.lock` / `pay.ap2`. Missing keychain entry fails before consume. Foyer does not store it. Constraints are `checkout_hash`, `max`, and `asset`. The call’s amount must be within `max`.

Then the agent calls `report` on the protocol MCP. The journal records that the proposer acked the outcome.

---

## Revoke and the journal

On the same Lock block:

- **Revoke this assistant’s live grants** — `POST /api/cabinet/me/grants` with `{ "scope": "agent", "agent_id" }`. Owner session. `scope: "house"` revokes every live grant in the house. `scope: "grant"` plus `grant_id` revokes one. A grant already consumed is not undone. The owner is notified on Telegram if linked, otherwise on a verified email.
- **Download the journal** — `GET /api/cabinet/me/grants`. Rows of grants and events: grant, invocation, report, revoke.

Sweep marks an unused grant `expired` after `expires_at`. The next consume then fails.
