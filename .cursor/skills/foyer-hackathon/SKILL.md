---
name: foyer-hackathon
description: Implements Foyer from docs/HACKATHON.md — protocol, gateway, four court outcomes, onboarding wizard, guardian vs spawn, stub adapters. Use when building features, choosing scope, or planning a hackathon day.
---

# Foyer hackathon build

1. Read [`docs/HACKATHON.md`](../../../docs/HACKATHON.md) and root [`AGENTS.md`](../../../AGENTS.md).
2. Implement the **outline of the whole product** on Vercel. Day 4 = public URL. Day 7 = MVP. Day 14 = startup-ready.
3. Each day deepens the whole system (§8). Do not cut days 1–3 to “two curls without a court.” Do not polish GenLayer before the public URL works.
4. Guardian is a real protocol client with its own agent key, woken by the tick. Spawn is only a harness. Gateway code never objects for anyone.
5. Time advances only in `sweep(principal, now)` — cron `POST /tick` plus every read. No daemons.
6. Onboarding success = non-empty inbox, not “read the spec.”
7. After a structural change, append a bullet to the Architecture change log in `AGENTS.md`.
