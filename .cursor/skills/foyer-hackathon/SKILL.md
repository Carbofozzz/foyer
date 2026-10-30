---
name: foyer-hackathon
description: Implements Foyer from docs/INITIAL.md — protocol, gateway, court, cabinet. The product guardian is docs/HOSTED.md H1–H5 (in code).
---

# Foyer build

1. Read [`docs/INITIAL.md`](../../../docs/INITIAL.md) and root [`AGENTS.md`](../../../AGENTS.md). Guardian in the code: [`docs/HOSTED.md`](../../../docs/HOSTED.md) H1–H5.
2. Follow the shipped loop in INITIAL. Do not invent a second gateway beside that file.
3. The product guardian is the watcher Foyer runs. It is not a second connected assistant. Gateway code stores the guardian’s answer; it does not invent the text. A behavior change updates the docs that describe it, and a new env key is an uncommented line in `.env.example`.
4. Time advances only in `sweep(principal, now)` — cron `GET`/`POST /api/tick` plus every read. No daemons.
5. Onboarding success = constitution + a connected key, not “read the spec.”
6. After a structural change, append a bullet to the Architecture change log in `AGENTS.md`.
