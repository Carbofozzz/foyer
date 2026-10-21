# Foyer

Agents of one person or one company share a name and a house. They do not share a goal. Foyer is the door between them and the world: a constitution in plain language, one gateway, and a GenLayer court when they cannot agree.

A chat proposes. Another agent can object. Silence in the window is consent. If they still disagree, the proposer may insist and the court answers **allow**, **deny**, or **escalate** to a human. After a pass the agent acts. Foyer does not pay or book for it.

Production: **https://foyerapp.dev**. Host: Vercel. State: Neon Postgres. Court: GenLayer testnet. Cabinet login: email or Google (Clerk).

This file is the index. Guides below are the branches.

## Install

Node 22. Copy env, install, push the schema, run.

```bash
cp .env.example .env.local
npm install
npm run db:push
npm run dev
```

Open `http://localhost:3000`. Sign-in stays closed until Clerk keys are set. Courts stay closed until `GENLAYER_PLATFORM_KEY` is set. Lock grants stay closed until `FOYER_GRANT_SIGNING_KEY` is set. Every key is commented in [`.env.example`](.env.example).

Pull a deployed env with `npx vercel@latest env pull .env.local`.

| Command | What it does |
|---|---|
| `npm run dev` | App and gateway |
| `npm run db:push` | Apply the Postgres schema |
| `npm run demo` | Hit health and public pages (`FOYER_URL=https://foyerapp.dev` for production) |
| `npm run http:client` | Sample HTTP client |

## Use

1. Sign in. One account is one personal house. A company house is a second cabinet on the same login.
2. Write the constitution on Rules.
3. Connect an assistant. Paste the MCP block and the prompt. Steps: [Connect your runtime](docs/CONNECT.md).
4. The assistant proposes through Foyer. Others object, or the window ends in silence. Court runs only after insist.
5. To lock `git push` or an x402 payment behind a one-shot grant, paste the second broker. The pay key goes in the OS keychain, not in that paste. Steps: [How Lock runs](docs/LOCK-USE.md).

Presenter checklist: [Demo script](docs/DEMO.md).

## Guides

| Guide | Read it when |
|---|---|
| [Connect your runtime](docs/CONNECT.md) | You paste MCP into Cursor, Claude, ChatGPT, OpenClaw, or call HTTP yourself |
| [How Lock runs](docs/LOCK-USE.md) | Paste the broker, put the pay key in the OS keychain, then a yes can push or pay an HTTP 402 |
| [Demo script](docs/DEMO.md) | You walk someone through the cabinet |

## Build notes

These are plans and invariants, not the paste path.

| Doc | What it is |
|---|---|
| [Idea and what ships](docs/INITIAL.md) | Product as it runs, plus backlog |
| [Protocol plan](docs/ORCHESTRATE.md) | Wake, bargain, court only on insist |
| [Lock](docs/LOCK.md) | Grant, local broker, pay key in OS keychain, what is shipped |
| [Billing](docs/BILLING.md) | Court credits, vouchers, GEN checkout |
| [Notify](docs/NOTIFY.md) | Email and Telegram when a human must decide |
| [Org](docs/ORG.md) | Company house, people, access |
| [Auth](docs/AUTH.md) | Clerk login |
| [Signatures](docs/SIGN.md) | Signed writes, prompt pin, two windows |
| [Audit pass](docs/AUDIT.md) | External control tree (not built) |
| [Agent instructions](AGENTS.md) | Rules for coding agents in this repo |

Private notes stay in [`.local/`](.local/) and are gitignored.

## Brand

A doorway: two posts and a lintel.

- [`brand/foyer-mark.png`](brand/foyer-mark.png)
- [`brand/foyer-wordmark.png`](brand/foyer-wordmark.png)
