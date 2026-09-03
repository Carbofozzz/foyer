# Next hackathon pass

Read `docs/HACKATHON.md` §3, §6 and §8. Implement the next slice of the **whole** system (not a new isolated feature). Host is Vercel.

- **Day 4 — public v0:** protocol with agent keys, four outcomes (offline OK) with `remedy_action`, `sweep()` on cron and reads, execute stub, observer, wizard + guardian, MCP + one connection card, spawn harness, i18n, **public URL with houses that stay private**.
- **Day 7 — MVP:** live GenLayer tx, cases A–D (`allow_b` both readings, a real remedy), remaining runtimes, external HTTP client, community checklist.
- **Day 14 — startup-ready:** accounts replace the cabinet link, landing, prod/preview, rate limits, connect docs, one almost-real adapter honoring `reversible`.

Do not start GenLayer polish before the day-4 URL works. No daemons and no `setTimeout` — time advances only in `sweep()`. Keep adapters as stubs unless a kind is explicitly made almost-real.
