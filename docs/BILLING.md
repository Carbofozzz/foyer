# Billing — court credits, subscription, vouchers

Agreed plan. Implement in slices B0–B4 below. Discussion notes (Russian) lived in `.local/BILLING.md`.

This is **not** a protocol change. Agent loop stays [ORCHESTRATE.md](ORCHESTRATE.md). Auth customer identity is [AUTH.md](AUTH.md) (`user_id` / verified email). Org product stays [ORG.md](ORG.md); Org 7 (paid create) is gated here. Notify channel for billing mail follows [NOTIFY.md](NOTIFY.md) (verified owner email). Do not fork propose/object/bargain/insist/court outcomes.

**Not the goal:** Foyer as the agent’s bank (Stripe adapters that pay or book for the agent). Only the right to use **court / org / quota**.

**Testnet note:** While GenLayer is on testnet, **Stripe (B4) is optional** — vouchers + ops grant carry the product. Ship B2–B3 (freeze/sweep/mail, crypto) before fiat checkout.

---

## Why

Today GenLayer fees come from the house sealed wallet (GEN / Studio faucet). After Auth the treasury tab is read-only; no GEN → offline escalate “could not pay the court”. Org create is still free until this plan.

The human pays Foyer (subscription, packs, or voucher). Foyer sponsors the court. UI counts **court credits**, not wei GEN.

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| **Unit** | `court_credit` = one case with a successful judge submit (`cases.tx` set). |
| **Paths** | Free + on-demand packs + subscription in the same model. |
| **Who pays GenLayer** | Platform wallet (v1). User need not see GEN. |
| **Charge timing** | Debit **only after** successful submit (tx hash). RPC / network / no hash → no debit, no refund path. |
| **One credit per case** | Resubmit of the same case does not take a second credit. |
| **Outcomes** | `allow` / `deny` / `escalate` are all valid; **no refund** after tx (`escalate` is a decision). On-chain error after tx: no second debit, no refund. |
| **No credit at insist** | Reject with “top up” / code — not silent offline escalate “no fee”. |
| **Balance scope** | Per cabinet (personal house vs org house). No shared account pool. Without an org, account ≈ personal cabinet in product language. |
| **Subscription period** | Anniversary month from activation. Short month → clamp to last day of month. |
| **Subscription includes** | N court credits / period + `feature_org` + better per-court price. |
| **Subscription ↔ org** | Company only with active `feature_org` subscription (and vice versa). |
| **Rollover** | Unused sub credits roll into the next period when renewed; **no accumulation cap**. |
| **Grace** | 5 days after `period_end`. Then unused **subscription** credits **burn** (do not become on-demand). |
| **On-demand** | Packs of credits; higher per-court price; **never expire**; no org. |
| **Free tier** | Admin sets M free courts / month; **no rollover**; no org; period = anniversary from **first login**. |
| **Prices / N / M** | Admin (plans table / ops desk). Not markdown as source of truth. |
| **Cabinet tab** | **Plan** (credits, subscription status, buy / redeem code). |
| **Pricing page** | Public `/:locale/pricing`: columns + checkmarks (Free / Pro / packs). Same plan data as admin. |
| **Org after lapse** | After grace → **freeze** (no access, data kept). Renew before sweep → unfreeze same org. |
| **Org sweep** | After **6 months** frozen → standard house **cascade delete** (same as admin desk). |
| **Billing email** | Pre mail **3 days** before `period_end` and **3 days** before sweep. No required grace-day mail. |
| **Providers** | Pluggable: `voucher` + `manual_admin` first; crypto (B3); **Stripe last (B4)**, optional on GenLayer testnet. Same grant path. |
| **Vouchers** | From day one (testnet). Common or email-bound; max redemptions; activate window + duration after redeem. |

---

## Product unit

| Concept | Meaning |
|---|---|
| **1 credit** | One case after successful judge submit (tx stored). |
| **GEN wallet** | Foyer infrastructure. Hidden in v1 product UI. |
| **Cabinet balance** | Available credits + subscription / Free status — not GEN. |

Spend order (implementation detail): Free monthly quota → subscription pool → on-demand balance (or equivalent clear UI). Cross-cabinet transfer is out for v1.

---

## Paths

| | Free | On-demand | Subscription (Pro) |
|---|---|---|---|
| Courts | M / month (admin) | Packs | N / period + rollover |
| Rollover | No | N/A (never expire) | Yes if renewed; no cap |
| Org | No | No | Yes (`feature_org`) |
| After lapse | Reset M next anniversary | Credits remain | Grace 5d → burn sub credits; org freeze |

Numbers stay in admin, not in this file.

---

## Platform pays GenLayer

Separate **user money → Foyer** from **Foyer → GenLayer**.

v1 = platform hot wallet pays the IC. Debit `court_credit` when `cases.tx` is written. House sealed wallet may remain for IC admin compatibility or move to platform-signed writes later — not a product blocker.

Race on two insists: reserve/confirm or atomic debit with tx write — implementation detail.

---

## Vouchers

```
vouchers
  id
  code                 -- normalized (upper, no spaces)
  kind                 -- credits | subscription | feature_org | bundle
  credits              -- optional
  plan_id              -- optional
  duration_sec         -- entitlement length from redeem
  max_redemptions
  redeemed_count
  bound_email          -- null = open; else lowercase match
  starts_at / ends_at  -- redeem window
  created_by           -- platform admin user id
  meta                 -- jsonb, no secrets
  created_at
```

Redeem: signed-in user → owner cabinet (personal or org) → ledger + audit.

Admin desk: create / revoke (`ends_at = now`) / list redemptions. `platform_role = owner` (ops later if scoped).

Testnet: codes like “3 months Pro + 20 courts” are the main way to open org + court without Stripe.

---

## Payment module

Billing is its own layer — not scattered through `insist` UI alone.

```
  Cabinet / API
       │
       ▼
  Billing service
    · balance / subscription state
    · grant credits / start plan
    · vouchers.redeem
    · ledger (append-only)
       │
       ▼
  Providers
    · voucher        ← first
    · manual_admin
    · stripe         ← next
    · crypto         ← later
```

| Provider contract (draft) | |
|---|---|
| `createCheckout(user, house, offer)` | → URL / intent |
| `handleWebhook(payload)` | → idempotent grant |
| `id` | `voucher` \| `stripe` \| … |

Ledger rows carry `provider`, `external_id`, `idempotency_key`. Duplicate webhooks must not double-grant.

---

## Org 7

| Rule | |
|---|---|
| Create / keep org | Active subscription (or voucher) with `feature_org` |
| After grace | Org **frozen** — no cabinet/API work; row kept |
| After 6 months frozen | Cascade delete (admin-style) |
| Renew while frozen | Unfreeze the same org |
| Personal Free | M courts / month; no org; packs or Pro on top |

Same Clerk session; no second login for org.

---

## Surfaces

- **Cabinet tab Plan** — balance, plan status, top-up (Stripe later), redeem code. Hide GEN address in tech/admin.
- **Public pricing** — `/:locale/pricing` (or replace landing stub): Free / Pro columns with checkmarks, pack SKUs, CTA. Copy and amounts from admin plans.
- **Ops admin** — plans (M, N, prices), vouchers, manual grant.

---

## Slices (do not skip)

### B0 — Ledger + entitlements + vouchers — shipped (2026-10-12)

- Tables: `billing_accounts`, `billing_ledger`, `vouchers`, `voucher_redemptions`, `billing_plans` (plans unused until B1).
- Admin: create/revoke voucher; manual grant credits.
- Cabinet **Plan** tab: balance, redeem code (`GET`/`POST /api/cabinet/:token/plan`).
- Gate `insist` when `FOYER_BILLING_GATE` is on (default); bare cases wait if balance hits zero before submit.
- Debit only when tx is stored; one credit per case.

**Check:** voucher credits → N courts pass; N+1 insist rejected. Propose/object without credit still works.

### B1 — Subscription + Free + pricing page — shipped (2026-10-12)

- Seeded plans: Free / Pro / packs (`ensureDefaultPlans`). Free anniversary from first login; spend Free → sub → on-demand.
- Activate Pro via subscription voucher (Stripe only in B4). Pack vouchers stay on-demand.
- Public `/:locale/pricing` + `GET /api/pricing` from `billing_plans`.
- Grace 5d; burn **subscription** leftovers only; Free resets without accumulation.
- `POST /api/orgs` requires personal `feature_org`.

**Check:** Free M then block; Pro rollover on renew; grace burn does not leave fake on-demand residue.

### B2 — Org freeze / sweep + billing mail

Product lifecycle without fiat. Do this before payment providers.

- No `feature_org` after grace → org frozen (403 on org cabinet/API).
- Keep data; after **6 months** frozen → cascade delete (same as admin desk).
- Renew before sweep → unfreeze the same org.
- Email: **3 days** before `period_end`; **3 days** before sweep (verified owner email / NOTIFY).

**Check:** lapse → freeze; renew → same org; 6 months → gone; mails fire once (idempotent).

### B3 — Crypto provider

- Same grant interface as vouchers; optional UX (not login).
- Useful on testnet / mainnet-adjacent without waiting on Stripe.

**Check:** crypto payment → same ledger grant; replay safe.

### B4 — Stripe (fiat) — last; optional on GenLayer testnet

- Checkout + webhook → same grant path (idempotent).
- Not required to run the product on GenLayer testnet (vouchers + ops grant + B2–B3 suffice).
- Ship when leaving “voucher-only” public test or when fiat is needed.

**Check:** paid Pro → org create; webhook replay safe.

---

## Out

- Foyer as escrow / bank with a stranger.
- Bonds / burn GEN in the IC.
- Charging propose/object (only court / org / quota).
- User marketplace for vouchers (ops issues codes in v1).
- Soft-delete / anonymize sweep (use standard house delete).
- Protocol outcome changes.

---

## Risks

| Risk | Mitigation |
|---|---|
| Double charge on retry | One credit per `case_id` after first tx |
| Charge without tx | Debit only when hash stored |
| Silent no-fee escalate | Reject insist / submit when balance is zero |
| Sub leftovers look like packs | Burn after grace; keep on-demand separate in ledger |
| Org zombie forever | Freeze then 6-month cascade sweep |
| Price drift | Admin plans feed pricing page — one source |

---

## Check (end-to-end)

1. Subscription voucher → org create ok; N courts; N+1 insist rejected until pack/code.
2. On-demand only → create org 403.
3. Email-bound voucher wrong email → fail.
4. `max_redemptions=1` second redeem → dead.
5. Past `ends_at` → cannot redeem; expired `duration` drops org entitlement → freeze path.
6. Stripe webhook (B4) idempotent when that slice ships.
7. Propose/object without credit still works; only paid court path is gated.
8. Pre-expiry and pre-sweep mail at 3 days; no required grace-day mail.
