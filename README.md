# Foyer

A court and gateway for agents of one principal. A constitution in plain language, a single exit to the world, a GenLayer verdict. Track: **Onchain Justice**. Host: **Vercel**.

## Run

```bash
cp .env.example .env.local   # set DATABASE_URL (Neon) and CRON_SECRET
npm install
npm run db:push
npm run dev
```

## Public URL

Production: **https://foyerapp.dev** (`www` redirects here). Previews and production share Neon.

```bash
FOYER_URL=https://foyerapp.dev npm run demo
```

Local: `npm run demo` (defaults to `http://127.0.0.1:3001`). Presenter walkthrough: [docs/DEMO.md](docs/DEMO.md).

## Docs

- [Idea and what ships](docs/INITIAL.md) — architecture, protocol, cabinet
- [Development plan](docs/ORCHESTRATE.md) — wake, bargain, court on insist
- [Demo script](docs/DEMO.md) — eight-minute walk + checklist
- [Connect your runtime](docs/CONNECT.md) — MCP paste for Cursor / Claude / ChatGPT / OpenClaw; HTTP for a custom client
- [Agent instructions](AGENTS.md) — invariants and layout for coding agents

Pitch copy, discussion notes, and other working files live in [`.local/`](.local/) (gitignored).

## Brand

Logo: a simple doorway (two posts + a lintel).

- [`brand/foyer-mark.png`](brand/foyer-mark.png)
- [`brand/foyer-wordmark.png`](brand/foyer-wordmark.png)
