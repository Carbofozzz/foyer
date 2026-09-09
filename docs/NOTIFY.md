# Notify the principal

When the loop needs a human (`escalate`), Foyer today only shows the decide form in the cabinet. This note is how we reach that person: **email first**, **Telegram second**. Not part of the agent protocol. Agents still poll; this is a house contact.

Until a slice here lands, cabinet + wallet login remain the only path. Protocol change is still [ORCHESTRATE.md](ORCHESTRATE.md).

---

## What already exists

- Status `escalated`. Principal picks `allow` or `deny` (`POST /api/cases/:id/appeal` or the decide link).
- **N1 email is live:** `email_verified_at`, confirm tokens, Contacts tab, `notifications` claimed in `sweep()`. Unverified email is stored and not used for escalate mail.
- **N2 Telegram is live:** start-link, webhook, `telegram_chat_id`. Linked chat skips email for that event.
- Wizard step “contacts”: email + disabled Telegram.
- `sweep()` is the only timer. Sends are idempotent there.

`verdicts.escalate_external` stays false. This is not a bridge to a stranger’s court.

---

## Where escalate can happen

Same human job every time: **yes or no on the original payload**. One notify type (`needs_decide`). The mail/Telegram line names the *reason*; the decide page is the same form as the cabinet.

Landing rail ([flow diagram](../app/components/flow-diagram.tsx)): ask → wait → quiet pass **or** talk (withdraw / revise / insist) → court → yes / no / ask you. Code also escalates **off that rail**. Those still need the ping. Checked against `sweep`, `lib/notify/wake.ts`, `lib/protocol/bargain.ts`, `lib/protocol/court.ts`, `lib/protocol/execute.ts`, `contracts/court.py` (2026-09-08).

| # | Stage on the rail | When | Code | `verdicts.judge` | Copy hint |
|---|---|---|---|---|---|
| 1 | Wait (silence window closed) | POST to a required hook URL never returned **2xx** (`fetch` `ok`, 200–299). Timeout, network error, missing hook secret, or non-2xx after retries → wake `failed`. Pending retries do not close the window. | `sweep` → `requiredWakeGate` → `escalateUnreachable` | `offline` | Hook POST did not return 2xx |
| 2 | Talk (bargain) | `bargain_until` passed and the proposer did **not** `insist` (and did not withdraw). | `timeoutBargains` → `escalateOffline` | `offline` | Bargain timed out |
| 3 | Court never ran | After insist: wallet below fee floor. | `submitForCase` → `NO_FEE` | `offline` | Could not pay the court |
| 4 | Court never ran | After insist: submit/RPC fails `COURT_TX_ERROR_LIMIT` times (default 3). | `noteSubmitFail` → `SUBMIT_FAIL` | `offline` | Court tx could not be sent |
| 5 | Court ran, no usable verdict | Finalized with error / no consensus, same error limit. | `markTxFailed` → `ERROR_ESCALATE` | `offline` | Court tx failed too often |
| 6 | Court (landing “ask you”) | IC returns `escalate` (charter silent or contradictory). | `advanceCase` → `applyVerdict` on-chain | `onchain` | Court asked you |
| 7 | Leftover rows | Stored `allow_b` / `remedy` (old IC). Live map is escalate; never permit a counter. Notify only if status becomes `escalated`. | `normalizeCourtOutcome` / `executeAfterAck` | as stored | Court asked you (legacy) |

`escalateOffline` does nothing if `insistedAt` is set or a case already has a tx — insist owns the court path; bargain timeout cannot steal it.

**Not escalate (do not send `needs_decide`):**

| Stage | What happens instead |
|---|---|
| Wait, all required wakes delivered, **no** objection | Silence allow. Permitted. |
| Wait, required wake still `pending` | Still retrying the hook POST. Window stays open. No verdict. |
| Talk: insist | Case opens, tick submits `judge`. Not escalate. Do not ping. |
| Talk: withdraw | `withdrawn`. Done. |
| Talk: revise | New revision, collect again. |
| Court `allow` / `deny` | Permit or empty payload; then `report`. |
| Court tx `pending` / view lag | Stay in court. Do not offline-escalate. |
| False offline `ERROR_ESCALATE` then IC JSON appears | `recoverFalseEscalate` may **replace** with allow/deny. Cancel unsent notify; do not send a second “ask you” if the human already decided. |
| Missed `report` | UI copy only. Different notice, later. Not yes/no. |

**Landing diagram gaps (code is ahead of the picture):** wait→failed hook POST, bargain timeout without insist, insist then no GEN / tx death. The three court pills only cover row 6. Keep the ping for 1–5 anyway. Optional later: hollow bullets on the public flow.

**Priority (what to send, not who):**

1. One outbound per action for `needs_decide`. First time status is `escalated` and still needs yes/no.
2. Channel: Telegram if linked, else verified email, else cabinet only (same as below).
3. If the reason later changes (false escalate recovered) before send: drop the row or rewrite the body; do not send a stale “court failed” after an on-chain yes.
4. Do not queue a second mail because reasoning changed after `sent`.

---

## Proposed answers


These are the defaults to argue with. Change the table, then implement.

| Question | Proposal |
|---|---|
| **Who is notified** | The house **owner** only. Operators keep the cabinet; they do not get the ping in v1. Org fan-out is INITIAL backlog. |
| **Which events** | Every row in [Where escalate can happen](#where-escalate-can-happen). Same decide page. Reason line from that table. **Not** missed `report`. **Not** insist / in court. |
| **Channel order** | If Telegram is linked and confirmed → Telegram only. Else if email is **verified** → email only. Else cabinet only (no send). Never both for the same event. |
| **Unverified email** | Store it. Show “confirm” in cabinet and wizard. Do not send escalation there. |
| **Mail body** | Locale of the house cabinet. Short: who asked, one-line summary, amount if present, “Allow or deny”. **No** full evidence, constitution, or agent keys. |
| **The link** | A **decide page** for that one action, signed token in the URL. Allow / deny only. Expires (propose **7 days**) or when the action is no longer `escalated`. Not a second house login: it cannot open treasury, rules, or other cases. Cabinet with RainbowKit still works in parallel. |
| **Telegram** | Same decide URL in the message (or two bot buttons that hit the same allow/deny). Bot + webhook (Vercel cannot poll). Second slice after email works. Schema and disabled UI can land with email. |
| **Idempotency** | One outbound row per `(action_id, channel)` in `pending` / `sent` / `failed`. Tick retries `pending`/`failed`. A later verdict or appeal cancels unsent rows. |
| **If send fails** | Cabinet still shows the form. Do not block the loop. Do not invent a local verdict. |

**Why a decide link, not “open the cabinet”.** Mail and Telegram are useless if the person must find a desktop wallet before they can tap yes. The token is scoped to one escalated action so it is not a second account.

**Why not both channels.** Duplicate pings; first tap wins. Owner who wants a copy can open the cabinet.

**Why not missed `report` in v1.** Copy already says the owner is notified; that path is still UI-only. Mixing it with yes/no mail confuses “the agent ignored ack” with “you must judge”. Ship escalate ping first.

---

## Product surface

**Wizard.** Email stays optional. Saving an address queues a confirm letter. Telegram: start-link opens the bot; `/start` with the signed payload stores the chat.

**Cabinet.** A **Contacts** block (own tab or under People / a row in settings — prefer a small tab next to Connect so it is findable without the wizard):

- Current email, verified or not; change; resend confirm.
- Telegram: Open bot / unlink. Linked chat skips email.
- One line: “We write here only when a request needs your yes or no.”

Observers do not edit. Owner only (same as charter).

**Decide page** `/:locale/decide/:token` (name flexible):

- Logged-out OK.
- Shows the same facts as the mail, plus allow / deny.
- If the token is spent, expired, or the action is already decided: a short dead state and a link to the cabinet.
- i18n catalogs. No hardcoded copy.

Demo cabinet: mock contacts, buttons do nothing. Do not send mail from demo.

---

## Slices

### N1 — Email

Shipped. Confirm on wizard/cabinet save; escalate mail from `sweep()` to a verified owner email; decide page. Telegram schema/UI stay stubs until N2.

### N2 — Telegram

Shipped. Start-link from Contacts and the wizard; webhook stores chat id; escalate ping is Telegram-only when linked.

---

## Out of scope

- SMS, WhatsApp, push.
- Notifying operators or several emails.
- Putting the principal’s yes/no through GenLayer again.
- Gateway or cron writing an objection.
- Hosted agents, waking chats.

---

## Check

1. Empty contacts → escalate appears only in the cabinet.
2. Email saved, not confirmed → no letter; banner to confirm.
3. Confirmed email → one letter, decide link allow/deny, cabinet form disappears.
4. Expired / reused token → dead state, no second verdict.
5. Telegram linked (N2) → no email for that event.
6. Tick twice → still one send.
7. Each escalate-table row can reach `escalated` + cabinet allow/deny (offline rows still have a `cases` row).
8. Silence allow, withdraw, revise, insist / in-court pending → no `needs_decide` send.
