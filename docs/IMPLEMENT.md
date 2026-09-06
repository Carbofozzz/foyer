# Implementation — working gateway

Depth after the day-14 freeze. Product plan: the Cursor plan *Depth after day 14*. Product invariants: [HACKATHON.md](HACKATHON.md). This file is how to build that plan, in order. Do not start a slice before the previous one is done. Do not invent a second protocol.

**Done when:** a connected agent asks; silence or court answers; after a pass the agent does the action itself; the feed does not say Foyer bought anything; demo and `npm run demo` show the same loop; each agent has a door-side summary; no court duty.

Bonds, appeal prices, per-agent wallets, and adapters that pay or book **for** an agent are out. House treasury stays an ops wallet for Studio gas (faucet). Do not grow it into a product.

---

## Slice 1 — Court off the read path

**Now:** `sweep()` on every protocol read and on the cabinet can call `openCourt` and wait ~60 s. `POST /api/tick` runs `for (house of all) await sweep(house)` in one request.

**Do:**

1. `sweep(principalId, now, { courts })` — reads and cabinet always pass `{ courts: 0 }`. They still close silence / ack / appeal windows and wake test clients. They never wait on GenLayer. Feed shows `inCourt` as soon as the window closed with objections.
2. `openCourt` / `stepHouseCourt` only from tick. Submit the judge tx, save the hash on the case, return. Later ticks poll GenLayer (`FINALIZED` + `FINISHED_WITH_RETURN` → IC JSON; `FINALIZED` + `FINISHED_WITH_ERROR` → retry). Finalization can take ~30 minutes. Do not wait in one request. Do not invent “no consensus”. After several finalized errors, escalate to the principal.
3. Tick must not judge every house in one process. Pick work that is due (open action, silence passed, has objections, no case yet). Handle one house — or a small bound — then return. Remaining houses wait for the next minute. Do not add a global “N courts per platform” quota.
4. Index `actions (principal_id, status, silence_until)` if a house sweep still scans too much.

**Files:** `lib/protocol/sweep.ts`, callers of `sweep` (protocol reads, cabinet screen, MCP handler), `app/api/tick/route.ts`.

**Check:** open the cabinet while a case is in court — the HTML returns without waiting on GenLayer. The feed stays `inCourt` until a tick sees `FINALIZED`. Tick of many houses does not serialize judge waits in one body.

Test-stage bound (one court per cron minute) is enough for now. Scale-out is [Later](#later--next-sheet) §L1.

---

## Slice 2 — Permit, not execute

**Now:** after allow, `lib/protocol/execute.ts` calls `adapters[kind].apply` and sets `status: executed`. Spend writes a receipt. Book/message are stubs. The feed says done. The agent never acts.

**Do:**

1. After silence-allow, or after a non-`escalate` verdict once ack (or ack timeout) is done, and once the appeal window has closed for irreversible kinds: mark the action **permitted**. Store the payload the agent may perform (`allow_a` / objector `counter_action` / `remedy_action`). Do not call `apply`.
2. While `appealUntil > now` on an irreversible kind, stay pre-permit (same hold as today, without a fake charge).
3. `escalate` stays `escalated`. Pure `allow_b` block: permitted payload is empty — the agent must not act.
4. Inbox / `GET /actions/:id` / MCP `get_action` expose a clear flag: `may_act` (boolean) and the permitted payload. Copy: allowed / denied — not “we carried it out”.
5. Leave adapter modules in the tree if tests still import them; stop using them as the meaning of a pass. Do not add a live spend-from-treasury adapter.

**Statuses (keep the column, change the meaning):**

| After | `status` | Agent |
|---|---|---|
| Open window | `open` | wait |
| Verdict, ack still owed | `awaiting_ack` | wait |
| Escalated | `escalated` | wait for the human |
| Pass, may perform | `permitted` | do it yourself |
| Block / do nothing | `permitted` + empty payload | do not act |

A later slice adds `reported`. Until then `executed` in old rows can be read as the old lie; new rows must not use “Foyer executed”.

**Files:** `lib/protocol/execute.ts`, `lib/protocol/actions.ts`, `lib/protocol/bundle.ts`, `lib/mcp/handler.ts` (tool text: after a pass, act with your own tools), `app/components/cabinet-screen.tsx`, catalogs `cabinet.statusExecuted` / `done` / landing flow node that still says payment/booking is Foyer.

**Check:** propose → silence or verdict → inbox says you may act (or must not). No new `spend_receipts` from a pass. No GEN leaves the house wallet for the request.

---

## Slice 3 — Demo and test

**Done.** Demo, DEMO.md, and `npm run demo` say a pass means the assistant acts. Test clients report after permit (slice 4).

**Was:** [DEMO.md](DEMO.md), first pass, spawn, Replay A–F, `npm run demo`, `/:locale/check` all describe stub execute.

**Do:** walk each surface and retarget it. Do not delete the harness.

- First pass / spawn test clients: after permit they call the new report (slice 4) or, until slice 4 lands, only show permit. Prefer shipping slice 4 in the same change if the demo would otherwise still look like “done”.
- Replay copy: “allowed, the agent acts next” — not “gateway executed”. Outcomes stay A–F.
- `docs/DEMO.md` and check items: drop “there is an execute stub”. Require “after a pass the test client acts / the test sees it”.
- `npm run demo`: same public pages; add a protocol check that a permitted action is not a treasury debit.
- Phrase matchers stay labeled test.

**Files:** `docs/DEMO.md`, `lib/replay/archive.ts`, `lib/protocol/house-clients.ts`, `scripts/demo.mjs`, `messages/*/check`, connect prompt lines in `lib/mcp/config.ts` (after a pass: use your own tools; still no acting before `may_act`).

**Check:** a stranger can finish the wizard, see a dispute, and understand that a pass means the assistant may proceed — not that Foyer paid.

---

## Slice 4 — Report + door stats

**Done.** `POST /api/actions/:id/report` `{ did }`, MCP `report`, derived door stats on chips.

Without a report, “disobeyed” and “has not bought yet” are the same.

**Protocol (same house, same action, agent key):**

`POST /api/actions/:id/report` `{ "did": true | false }`

- Only the proposer (or the agent who must perform the permitted payload).
- `did: true` before `may_act` or after a deny/block → counted as **broke the door**. Accept the row anyway so the principal can see it.
- `did: true` after `may_act` → **did**.
- `did: false` after `may_act` → **skipped**.
- One report per action (idempotent). MCP tool `report` with the same body.
- OpenAPI + MCP ping list the tool.

**Stats** — derived, no leaderboard table. Per agent in the house, from that house’s actions + reports:

- proposed
- passed / blocked / escalated to human
- broke the door (`did: true` without a pass)
- passed and not reported
- passed and did / skipped

Cabinet: short line on the agent chip or a details row. Owner uses it to edit the assistant’s prompt.

**Limit (write it in the UI hint):** a purchase that never touched Foyer is invisible. Seeing that is [Later](#later--next-sheet) §L2.

**Files:** new `lib/protocol/report.ts`, route under `app/api/actions/[id]/report`, schema column or small `reports` table on `action_id` unique, `lib/openapi/spec.ts`, MCP handler, cabinet chips.

**Check:** test client reports after permit → “did” increments. Report before permit → “broke the door” increments. Other house’s key → 404.

---

## Slice 5 — Telegram (email fallback)

**After slice 1** so a cabinet link in the message does not hang.

- Owner (`canManage`) links a bot in the cabinet: deep link / one-time code → agent writes the bot → store `telegram_chat_id` on the principal. Unlink in the same place.
- Optional email on the same card. Send email **only if** no chat id.
- On verdict write (`lib/protocol/court.ts`), one notice: escalate (“you decide”) or appeal window (“you may override until …”). Cabinet URL. Do not resend for the same verdict. Transport failure must not fail `openCourt`.
- Default `appealWindowSec`: **86400**. Existing houses: migrate default for new rows; bump existing personal houses in the same change or leave them and document it — prefer one UPDATE to 86400 so the product matches the plan.
- Env: `TELEGRAM_BOT_TOKEN`. Email provider key only for the fallback. Neither in git.
- Empty chat and empty email: cabinet says notices are off.

No Telegram login. No fan-out to every member.

**Files:** schema on `principals`, `lib/notify/` (send only), cabinet card + `POST /api/cabinet/:token/notify`, court.ts hook, `.env.example`.

**Check:** after a verdict, the linked chat gets one message. Court still records if Telegram is down.

---

## Slice 6 — Guardian HTTP and feed deadlines

- `runGuardians` in sweep: unseal the test client key and `POST /api/actions/:id/objections` (or call the same handler the route uses) with that `agk_`. Do not keep `fileObjection` as a privileged in-process shortcut for the product path. Phrase clients stay test-only.
- Feed rows show `silence_until` / `appeal_until` as clock times.
- Window length by kind/amount: use existing `silenceWindowSec` / `ackTimeoutSec` / `appealWindowSec` (rules or a small function on `Principal`). No new entity.
- MCP URLs: canonical origin (`www`) after the apex redirect — `lib/mcp/config.ts` / `publicOrigin`.
- Org members: clarify who withdraws vs who only reads. No second login.

**Files:** `lib/protocol/sweep.ts`, `lib/protocol/house-clients.ts`, cabinet feed, members card copy.

**Check:** objection rows have the test client as objector through the public path. Free-form charter that lacks canned phrases does not fire them.

---

## Order

1. Court off read + tick  
2. Permit, not execute  
3. Demo and test (with report if the demo would still look executed)  
4. Report + stats  
5. Telegram + 24 h appeal  
6. Guardian over HTTP, deadlines, origin, org copy  

One changelog bullet in `AGENTS.md` per slice. New env keys in `.env.example`. UI strings in `en` / `es` / `de` / `tr` / `ru`. Comments in English.

## Out of scope

Bonds, court duties, appeal fees, Foyer paying or booking, a second account, a fifth outcome. Do not put these on the next sheet.

---

## Later — next sheet

Seed for the **next** implementation list. Do not start these in slices 1–6.

**L1. Courts at many houses.** One cron / one court per minute will not hold at ~100 houses. Do not raise N courts inside one tick. One due house → one job (queue or per-house tick). Courts run in parallel in different invocations. No global platform quota.

**L2. Off-door acts.** Door stats only see what went through Foyer or what the agent reported. Closing the hole is **L10**, not a prompt.

**L3. Telegram to every member.** This sheet: owner chat only. Later: optional fan-out to operators, still no Telegram login.

**L4. Several deadlocks in one house.** This sheet: one `openCourt` per house sweep. Later: more than one case on that house’s IC without blocking the cabinet.

**L5. Signatures / A2A.** Request signing, foreign clients. Not a cabinet blocker.

**L6. `escalate_external`.** Field exists, stays false until there is an external court to bridge.

**L7. Pin agent version.** Separate idea. Do not mix into the gateway.

**L8. Mainnet GenLayer.** When studio-dev is no longer enough.

**L9. Window policy depth.** This sheet: kind/amount on existing `Principal` fields. Later: richer rules without a new entity if we can, or a documented exception.

**L10. Hands only after a pass, only for that action.** A prompt is not a lock. The agent’s runtime has no pay / book / mail tools — only Foyer (propose, inbox, ack). After `may_act`, Foyer mints a **one-shot capability** bound to that action: kind, amount, target, expiry, single use. Hands appear as one call (`perform`, or the agent’s own Stripe/calendar wrapper) that **consumes** the capability. Wrong payload or a second use fails. Foyer still does not pay; it unlocks the agent’s own method for that act only. Capability gone or expired — no hands. Without the runtime lock (tools off until the capability exists) the agent can still walk around. Consume is recorded and feeds door stats.
