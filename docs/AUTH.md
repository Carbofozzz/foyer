# Auth — cabinet login without a wallet

Agreed plan. Implement in slices A0–A3 below. Discussion notes (Russian) lived in `.local/AUTH.md`.

This is **not** a protocol change. Agent loop stays [ORCHESTRATE.md](ORCHESTRATE.md). Org product stays [ORG.md](ORG.md), with an explicit exception: this plan **rewrites** personal login / `ensureHouseForOwner` / member identity (wallet → user). Do not fork propose/object/bargain/insist/court/`sweep`.

A0 + A1 shipped (2026-10-11): Clerk login, `users` / `owner_user_id` / members by `user_id`, `house_invites` (claimed on verified login), `admin_audit_log`, platform desk gate, spawn and wallet login removed, treasury read-only, wizard off. A2 (invite letter + accept link) and A3 (desk parity) remain.

---

## Why

Hackathon login = address. Production needs a person account (email / Google) so org invites, billing, and notify attach to a user — not MetaMask. GenLayer court fees are paid by the **platform** wallet ([BILLING.md](BILLING.md)); leftover house sealed keys are not the login. Agent protocol (`agk_`) unchanged.

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| **Vendor** | **Clerk** — email + Google. Not Privy / Auth.js for Auth. |
| **Wallet ↔ login** | Fully split. No SIWE, no RainbowKit on sign-in, no prove-wallet migration. |
| **Wallet later** | Optional crypto UI for GEN Plan checkout (B4); not Auth. |
| **Wizard** | Turn **off** the hackathon modal. Product onboarding is a separate UX later. |
| **Database** | New empty Neon DB = another `DATABASE_URL` for local/preview. Do not touch prod URL until cutover. No row migration. |
| **Cutover** | Switch prod `DATABASE_URL` to the new DB (fresh). Old URL retired. |
| **Platform admin** | Designed in Auth. Roles: `none` \| `ops` \| `owner` (not a boolean). Separate from house grants. |
| **Admin bootstrap** | `FOYER_ADMIN_EMAILS` → all listed emails get `platform_role = owner`. Role `ops` exists in schema; no ops email list yet. |
| **Treasury after Auth** | **Read-only** tab (house address / balance). No deposit, withdraw, connect wallet, faucet in product UI. Simplified working treasury before an intermediate prod milestone — not Auth. |
| **Spawn** | **Remove** (`POST /api/spawn` + landing harness). Look-only `/cabinet/demo` is removed too. |
| **Impersonate** | **Not needed.** Do not design it. |

---

## What exists today (old Neon until cutover)

| Piece | Today | After Auth |
|---|---|---|
| Login | nonce + `personal_sign` → `foyer_session` = address | Clerk → session = user |
| Personal house | `ensureHouseForOwner(address)`, unique `owner_address` | `ensurePersonalHouseForUser(userId)`, `owner_user_id` |
| Org members | `house_members.address` | `house_members.user_id` + email invite |
| Admin | `FOYER_ADMIN_ADDRESS` | `users.platform_role` + `FOYER_ADMIN_EMAILS` |
| Treasury UI | deposit from login wallet | read-only |
| Wizard | modal | off |
| Decide | token, no login | unchanged |
| Spawn | landing harness | removed |
| Agents | `agk_` | unchanged |

Keep: gateway client is always an agent; UI does not open a case around the API; gateway never objects; one protocol for personal and org; personal ≠ org principal.

---

## Vendor needs

| Need | Why |
|---|---|
| Email + Google | Sign-in |
| Stable subject id | Map to our `users.auth_subject` |
| Session on Vercel | Cabinet SSR + API |
| Verified email | Invite, billing, notify |

No wallet SDK in this track.

---

## Data model (clean slate)

Names are draft. Do not keep `owner_address` as identity.

```
users
  id                 text PK          -- usr_…
  auth_subject       text unique      -- Clerk user id
  email              text             -- lowercased; unique recommended
  email_verified     bool
  name               text nullable
  platform_role      text not null default 'none'
                     -- 'none' | 'ops' | 'owner'
  created_at
  last_seen_at       nullable

principals
  …protocol fields…
  owner_user_id      text nullable → users.id
                     -- personal: set, unique among personal
                     -- org: null; ownership via house_members

house_members
  principal_id
  user_id            → users.id
  role / grants      -- in-house only, not platform
  PK (principal_id, user_id)

house_invites
  id
  principal_id
  email
  grants
  token_hash
  expires_at
  accepted_at / accepted_user_id

admin_audit_log
  id
  actor_user_id      → users.id
  op                 text
  target_type        text
  target_id          text
  meta               jsonb            -- no secrets/keys
  created_at
```

Session: Clerk → `users.id` (+ `platform_role`) → houses via `owner_user_id` + `house_members`.

`ensurePersonalHouseForUser(userId)` — one personal house on first login.

`requirePlatformAdmin` — `platform_role ∈ {ops, owner}`; else **404** (do not advertise the desk).

No `linked_wallet` in Auth. Protocol tables recreated for the live loop; no hackathon row migration.

---

## Platform admin

Not house Access and not org owner. Foyer ops: list users/houses, delete junk; later billing support.

### Permission layers (do not mix)

| Layer | Lives on | Examples |
|---|---|---|
| **Platform** | `users.platform_role` | Ops desk, delete any house, waitlist, (later) billing |
| **House** | `house_members` + grants | Charter, connect, org invite |
| **Agent** | `agk_` | Protocol writes |
| **Decide** | decide token | One escalate yes/no |

House owner does not become platform admin. A platform admin may still own a personal house as a normal user.

### Bootstrap

1. `FOYER_ADMIN_EMAILS` — comma-separated lowercased emails.
2. On `upsertUser` after Clerk: if email is listed → `platform_role = owner`.
3. Env is source of truth for promotion; remove from env (+ DB downgrade if needed) to demote.
4. Remove `FOYER_ADMIN_ADDRESS`. Do not use Clerk Organizations as the role source.

| `platform_role` | Meaning | Auth desk v1 | Later |
|---|---|---|---|
| `none` | Normal user | Own cabinet | — |
| `ops` | Foyer staff | Waitlist, users, houses, delete + audit | Support without billing buttons |
| `owner` | Lead ops | Same as `ops` in v1 | Billing override, promote/demote, dangerous ops |

`requirePlatformAdmin` = `{ops, owner}`. Dangerous mutations later require `owner`.

### Desk capabilities

| Capability | Today | Auth slice |
|---|---|---|
| Waitlist list | yes | yes |
| Houses + counts | yes | yes; owner = user email |
| House contact emails | yes | yes |
| Delete waitlist / house | yes | yes + audit |
| **Users** list | no | **yes** (email, role, last_seen, houses) |
| Impersonate | no | **never** |
| Show agent / sealed keys | no | **never** |
| Promote from UI | no | later; env bootstrap |
| Billing credit | no | BILLING; role field ready |

### API / UI

- `GET`/`POST /api/admin` — `requirePlatformAdmin` by user id.
- `GET /api/me` → `{ user, houses, platform_role, admin: role !== 'none' }`.
- `/:locale/cabinet/admin` — admin only; else 404.
- Every admin mutation → `admin_audit_log`.
- Same Clerk login as everyone else; stricter rate limit on admin writes; audit without secret bodies.

---

## Proposed answers

| Question | Answer |
|---|---|
| Vendor | Clerk (email + Google) |
| Session | User id + `platform_role`, not `0x` |
| Personal house | Auto on first login |
| Wallet on login | No |
| Wallet in product | BILLING later |
| Data | New `DATABASE_URL` for dev/preview; prod until cutover; no migration |
| Wizard | Off |
| Org invite | Email + grants → `house_members.user_id` |
| Org member | Cabinet by grants, no wallet |
| Treasury in Auth | Read-only |
| Platform admin | `none`/`ops`/`owner`; `FOYER_ADMIN_EMAILS` → `owner` |
| Impersonate | No |
| Decide-link | Unchanged |
| Demo | Look-only, no login |
| Spawn | Remove |
| Contacts | Prefill from Clerk ok |
| Agent protocol | Unchanged |
| i18n | All five catalogs |

---

## Product surface

- **Landing:** Clerk Sign in / Sign up. No Connect wallet.
- **Cabinet header:** email / name, sign out; ops link if admin.
- **Wizard:** off.
- **Org Access:** invite by email.
- **Ops admin:** waitlist, users, houses, deletes + audit.
- **Treasury:** read-only.
- **RainbowKit:** remove from login path (return only if BILLING needs crypto UI).

---

## Slices (do not skip)

### A0 — New DB + schema

- Empty Neon DB → new `DATABASE_URL` for local/preview. Leave prod on the old URL.
- Schema: `users`, principals with `owner_user_id`, members by `user_id`, invites, `admin_audit_log`, protocol tables.
- `.env.example`: `CLERK_*`, `FOYER_ADMIN_EMAILS`; drop address-based admin as login gate.
- Cutover later: point prod at the new URL.

### A1 — Clerk + personal house + admin gate

- Clerk auth; `upsertUser` + env bootstrap to `owner`.
- `ensurePersonalHouseForUser`.
- Landing + cabinet login/logout; wizard off.
- `GET /api/me` with `admin` / `platform_role`.
- `requirePlatformAdmin` on `/api/admin` and admin page (thin desk ok).
- Delete SIWE / wallet session routes.
- Delete spawn (API, landing UI, related copy/OpenAPI); do not keep `is_spawn` unless needed elsewhere.

**Check:** normal user → cabinet, no admin. Listed admin email → admin link + `/api/admin` 200. Spawn 404.

### A2 — Org invite by email — shipped

- Create org; invite by email; grants; header switch. No member address.
- Pending invite stores a one-time token hash and emails `/:locale/invite/:token` (Resend; logs in dev if unset).
- Known verified user is added immediately and emailed a cabinet link.
- Accept page: Clerk sign-in with the invited email → membership → `cabinet?house=`.
- Re-invite refreshes the token and resends mail. Claim-on-login by email still works.

**Check:** colleague gets mail, signs in with that email, sees the org without a wallet.

### A3 — Admin desk parity + audit — shipped

- Overview: waitlist, **users**, houses (owner email), deletes.
- Mutations → `admin_audit_log`.
- OpenAPI `0.54.0`.

**Check:** delete house audits; non-admin 404; MCP smoke.

Billing track: [BILLING.md](BILLING.md) — B0–B4 shipped; B5 Stripe optional. `platform_role` already ready.

---

## Out

Hackathon row migration; wizard redesign (only off); impersonate; promote-from-UI; showing keys in admin; Lock / Hosted / Notify N3; protocol loop edits; SSO/SAML. (Billing / Org paid create / GEN crypto → [BILLING.md](BILLING.md).)

---

## Risks

| Risk | Mitigation |
|---|---|
| Break live foyerapp.dev | Dev/preview on another `DATABASE_URL` |
| Cutover | Swap prod URL only; no user migration |
| Admin = normal Clerk login | Env email bootstrap; 404 for others |
| Mix house grants and platform | Separate fields; `requirePlatformAdmin` ≠ `accessFor` |
| Court with no top-up UI | Platform wallet + credits (BILLING B0–B4); faucet tops platform on Studio |
| ORG forbid-list | This file is the exception for login rewrite |

---

## Check (end-to-end)

1. Sign up → personal cabinet, no wallet, no wizard.
2. Connect → `agk_` → MCP ping.
3. Org invite email → accept → grants.
4. Decide-link without login.
5. Admin email → desk; users + houses; delete → audit.
6. Non-admin → admin URL/API as 404.
7. No SIWE / RainbowKit login.
8. propose / object / insist / report unchanged.
