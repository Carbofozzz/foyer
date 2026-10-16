# Billing — court credits, subscription, vouchers

Status: **B0–B4 shipped** (2026-10-12…14). Remaining: **B5 Stripe** (optional while GenLayer is testnet). Discussion notes (Russian) lived in `.local/BILLING.md`.

This is **not** a protocol change. Agent loop stays [ORCHESTRATE.md](ORCHESTRATE.md). Auth customer identity is [AUTH.md](AUTH.md) (`user_id` / verified email). Org product stays [ORG.md](ORG.md); Org 7 (paid create) is gated here via `feature_org`. Notify channel for billing mail follows [NOTIFY.md](NOTIFY.md) (verified owner email). Do not fork propose/object/bargain/insist/court outcomes.

**Not the goal:** Foyer as the agent’s bank (Stripe adapters that pay or book for the agent). Only the right to use **court / org / quota**.

**Testnet:** vouchers + ops grant + GEN crypto carry the product. Fiat (B5) is last and optional.

---

## Shipped summary

| Slice | What landed |
|---|---|
| **B0** | Ledger, vouchers, Plan redeem, `insist` credit gate, debit after `cases.tx` |
| **B1** | Free / Pro / packs, Free anniversary, spend Free→sub→on-demand, `/pricing`, org needs `feature_org` |
| **B2** | Platform GEN wallet pays deploy/judge; floor wait; admin low-GEN mail; `court_gas_stats` |
| **B3** | Org freeze after grace; 6-month cascade; renew unfreezes; pre-expiry / pre-sweep mail |
| **B4** | GEN checkout to platform (`billing_checkouts`, `price_wei`); Plan confirm by tx |

**Cabinet Plan tab:** tariff / credit pools / top-up (GEN when priced, else Stripe stub) / redeem code / ledger history (OpenAPI `0.59.1`).

**OpenAPI:** `0.55.0`…`0.59.1` across the slices.

---

## Why

Before billing, GenLayer fees came from each house sealed wallet (GEN / Studio faucet). After Auth the treasury tab is read-only; an empty house wallet meant offline escalate “could not pay the court”. Org create was free.

Now the human pays Foyer (subscription, packs, voucher, or GEN). Foyer sponsors the court from one platform wallet. UI counts **court credits**, not wei GEN.

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| **Unit** | `court_credit` = one case with a successful judge submit (`cases.tx` set). |
| **Paths** | Free + on-demand packs + subscription in the same model. |
| **Who pays GenLayer** | One platform wallet (B2): deploys every house IC, is its `admin`, signs and pays every `judge`. User need not see GEN. |
| **Low GEN alert** | Email every address in `FOYER_ADMIN_EMAILS` when platform balance drops below a **configurable** alert threshold (env/ops; default above `COURT_FLOOR_WEI`). Idempotent: one mail while low, again only after recovery then a new dip. |
| **Court gas stats** | Persist per court write (deploy / judge / resubmit): case id, tx hash, estimated fee wei, optional actual/delta from balance. Ops-only; feed credit pricing later. Never shown in the cabinet. |
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
| **Cabinet tab** | **Plan** — tariff, credit pools, GEN top-up when priced, redeem code, ledger. |
| **Pricing page** | Public `/:locale/pricing`: columns + checkmarks (Free / Pro / packs). Same plan data as admin. |
| **Org after lapse** | After grace → **freeze** (no access, data kept). Renew before sweep → unfreeze same org. |
| **Org sweep** | After **6 months** frozen → standard house **cascade delete** (same as admin desk). |
| **Billing email** | Pre mail **3 days** before `period_end` and **3 days** before sweep. No required grace-day mail. |
| **Providers** | `voucher` + `manual_admin` + **crypto (B4)** shipped; **Stripe (B5)** last, optional on GenLayer testnet. Same grant path. |
| **Vouchers** | Common or email-bound; max redemptions; activate window + duration after redeem. |

---

## Product unit

| Concept | Meaning |
|---|---|
| **1 credit** | One case after successful judge submit (tx stored). |
| **GEN wallet** | Foyer infrastructure (platform key). Hidden in product UI except crypto payee when checkout is on. |
| **Cabinet balance** | Available credits + subscription / Free status — not GEN. |

Spend order: Free monthly quota → subscription pool → on-demand balance. Cross-cabinet transfer is out for v1.

---

## Paths

| | Free | On-demand | Subscription (Pro) |
|---|---|---|---|
| Courts | M / month (admin) | Packs | N / period + rollover |
| Rollover | No | N/A (never expire) | Yes if renewed; no cap |
| Org | No | No | Yes (`feature_org`) |
| After lapse | Reset M next anniversary | Credits remain | Grace 5d → burn sub credits; org freeze |

Numbers stay in admin / `billing_plans`, not in this file.

---

## Platform pays GenLayer

Separate **user money → Foyer** from **Foyer → GenLayer**.

**Live (B2):** one **platform wallet** signs everything. Key in env (`GENLAYER_PLATFORM_KEY`), never in Postgres, never per house. It deploys each house IC (still one IC per house), is its `admin`, submits `judge`, reads `get_verdict`. Debit `court_credit` when `cases.tx` is written — credits are what the human pays for, GEN is Foyer's cost.

Leftover house sealed wallets no longer pay court fees. Faucet top-up targets the platform address on Studio chains; off Studio, ops funds by hand.

**Alert vs floor:** `COURT_FLOOR_WEI` stops submit (case waits). A separate **alert threshold** triggers mail to `FOYER_ADMIN_EMAILS`. Both configurable; floor stays a hard gate.

**Gas stats:** every platform-signed court write records fee data in `court_gas_stats`. Ops desk aggregates for pack / Pro pricing.

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

Testnet: codes like “3 months Pro + 20 courts” remain the main fiat-free path to open org + court; GEN crypto (B4) is the other.

---

## Payment module

```
  Cabinet / API
       │
       ▼
  Billing service
    · balance / subscription state
    · grant credits / start plan
    · vouchers.redeem
    · crypto checkout / confirm
    · ledger (append-only)
       │
       ▼
  Providers
    · voucher        ← shipped
    · manual_admin   ← shipped
    · crypto         ← shipped (B4)
    · stripe         ← B5 (optional)
```

| Provider contract | |
|---|---|
| `createCheckout(user, house, offer)` | → intent (GEN payee + amount, or Stripe URL later) |
| `confirm` / webhook | → idempotent grant |
| `id` | `voucher` \| `crypto` \| `manual_admin` \| `stripe` |

Ledger rows carry `provider`, `external_id`, `idempotency_key`. Duplicate confirms / webhooks must not double-grant.

---

## Org 7

| Rule | |
|---|---|
| Create / keep org | Active subscription (or voucher / crypto Pro) with `feature_org` |
| After grace | Org **frozen** — no cabinet/API work; row kept |
| After 6 months frozen | Cascade delete (admin-style) |
| Renew while frozen | Unfreeze the same org |
| Personal Free | M courts / month; no org; packs or Pro on top |

Same Clerk session; no second login for org. Gate is live (`assertFeatureOrg` on `POST /api/orgs`).

---

## Surfaces

- **Cabinet tab Plan** — tariff + status, credit pools, GEN offers when `price_wei` set, redeem code, ledger. Card CTA is a stub until B5.
- **Public pricing** — `/:locale/pricing` + `GET /api/pricing` from `billing_plans`.
- **Ops admin** — vouchers, manual grant, platform wallet / gas stats / thresholds.

---

## Slices

### B0 — Ledger + entitlements + vouchers — shipped (2026-10-12)

- Tables: `billing_accounts`, `billing_ledger`, `vouchers`, `voucher_redemptions`, `billing_plans`.
- Admin: create/revoke voucher; manual grant credits.
- Cabinet **Plan**: `GET`/`POST /api/cabinet/:token/plan` (redeem).
- Gate `insist` when `FOYER_BILLING_GATE` is on (else on in production, off locally).
- Debit only when tx is stored; one credit per case.

### B1 — Subscription + Free + pricing page — shipped (2026-10-12)

- Seeded Free / Pro / packs. Free anniversary from first login; spend Free → sub → on-demand.
- Activate Pro via subscription voucher (or crypto / Stripe later). Packs stay on-demand.
- Public `/:locale/pricing` + `GET /api/pricing`.
- Grace 5d; burn **subscription** leftovers only.
- `POST /api/orgs` requires personal `feature_org`.

### B2 — Platform court wallet — shipped (2026-10-13)

- `GENLAYER_PLATFORM_KEY`; `court_abi` 9; platform is IC `admin`.
- Below floor → case waits (no debit). Alert mail latch. `court_gas_stats` + ops panel.
- OpenAPI `0.57.0`.

### B3 — Org freeze / sweep + billing mail — shipped (2026-10-14)

- After grace → `org_frozen_at` + 403 on org cabinet/API.
- After **6 months** frozen → cascade delete.
- Renew → unfreeze. Pre-expiry / pre-sweep mail (3 days, ledger idempotency).
- OpenAPI `0.58.0`.

### B4 — Crypto provider — shipped (2026-10-14)

- `billing_checkouts` + `billing_plans.price_wei`; payee = platform wallet.
- Plan: `crypto_checkout` → send GEN → `crypto_confirm` (finalized transfer, value ≥ amount, to = payee).
- Grant via `activateSubscription` / `grantCredits`, provider `crypto`; replay-safe (`tx` unique + `crypto:{checkoutId}`).
- Env: `FOYER_*_PRICE_WEI`, optional `FOYER_CRYPTO`, `FOYER_PRO_DURATION_DAYS`.
- OpenAPI `0.59.0` (+ Plan UX `0.59.1`).

### B5 — Stripe (fiat) — **next**; optional on GenLayer testnet

- Checkout + webhook → same grant path (idempotent).
- Not required to run the product on GenLayer testnet (vouchers + ops + B2–B4 suffice).
- Ship when leaving “voucher/crypto-only” public test or when fiat is needed.

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
| Platform wallet runs dry | Floor stops submit (case waits); alert threshold emails admins once per dip; ops desk shows balance |
| Blind credit pricing | Court gas stats per tx; ops aggregates before changing pack/Pro prices |
| One hot key for every house | Env only, sealed; rotate = new address + `court_abi` bump |
| Double GEN grant | Unique checkout `tx` + ledger idempotency key |

---

## Check (end-to-end)

1. Subscription voucher → org create ok; N courts; N+1 insist rejected until pack/code.
2. On-demand only → create org 403.
3. Email-bound voucher wrong email → fail.
4. `max_redemptions=1` second redeem → dead.
5. Past `ends_at` → cannot redeem; expired `duration` drops org entitlement → freeze path.
6. GEN checkout: finalize transfer to platform → grant; same tx twice → no double grant. Stripe webhook (B5) when that slice ships.
7. Propose/object without credit still works; only paid court path is gated.
8. Pre-expiry and pre-sweep mail at 3 days; no required grace-day mail.
9. House with an empty own wallet still gets a verdict (platform wallet pays); platform below floor → case waits, no debit.
10. Platform below alert threshold → one mail to each `FOYER_ADMIN_EMAILS`; no repeat until balance recovers then dips again.
11. Each platform court submit leaves a `court_gas_stats` row usable for cost-per-credit analysis.
