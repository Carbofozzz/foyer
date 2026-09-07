---
name: foyer-hackathon
description: Implements Foyer from docs/INITIAL.md — protocol, gateway, court, cabinet, guardian vs spawn. Use when building features or choosing scope. Protocol replacement is docs/ORCHESTRATE.md.
---

# Foyer build

1. Read [`docs/INITIAL.md`](../../../docs/INITIAL.md) and root [`AGENTS.md`](../../../AGENTS.md). Development plan: [`docs/ORCHESTRATE.md`](../../../docs/ORCHESTRATE.md).
2. Follow the shipped loop in INITIAL until an ORCHESTRATE slice lands. Do not invent a second gateway beside that file.
3. A product guardian is a connected assistant that reads the constitution. Phrase-matching clients in `agents/` are test-only — label them. Spawn is a throwaway house. Gateway code never objects for anyone.
4. Time advances only in `sweep(principal, now)` — cron `GET`/`POST /api/tick` plus every read. No daemons.
5. Onboarding success = constitution + a connected key, not “read the spec.”
6. After a structural change, append a bullet to the Architecture change log in `AGENTS.md`.
