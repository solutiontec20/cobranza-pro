# Allowance request workflow

## Objective

Replace direct administrator/supervisor viaticum registration with a collector-originated request
that an administrator or supervisor approves or rejects. Approval must atomically create the existing
allowance cash movement so the daily cash calculation remains correct and auditable.

## Problem

The current cash-closure module lets administrators register an allowance directly, while collectors
can only request operating expenses. An allowance is cash entrusted to a collector and increases
expected cash; an approved operating expense reduces expected cash. Reusing expense requests for
allowances would invert the financial meaning and corrupt reconciliation.

## Authorized scope

- Remove direct `Registrar viático` from the admin/supervisor cash-closure UI.
- Let a collector request a viaticum for their own current business day.
- Let administrators/supervisors approve or reject pending viaticum requests.
- On approval, create the existing `allowance` cash inflow atomically and link it to the request.
- Keep opening registration, operating-expense requests/review, and closure validation unchanged.
- Preserve complete requester/reviewer/time/rejection audit data.

## Constraints

- Financial writes remain transactional PostgreSQL RPCs.
- Collector access is limited to their own requests; reviewers can see all portfolios.
- No physical deletion of requests or cash movements.
- No request or approval after the day's closure is validated.
- UI remains Spanish, mobile-first, accessible, and consistent with existing cash-closure screens.
- Use pnpm exclusively and do not perform remote operations.
- Do not create commits, following the user's standing instruction.

## Delivery

- Strategy: ask-on-risk; commit/PR slicing does not apply because commits are explicitly disallowed.
- Forecast: approximately 1,000 authored changed lines across one migration, pgTAP coverage, generated
  database types, repository/store contracts, and both cash-closure views.
- RDD: disabled/unmanaged.

## Testing mode

- TDD: off; no explicit project/session TDD setting exists.
- Database checks: `pnpm supabase db lint --local --level error` and `pnpm supabase test db`.
- Unit runner: `pnpm test:ci` (direct local Angular binary if the pnpm shim is unavailable).
- Build runner: `pnpm build` (direct local Angular binary if needed).

## Acceptance criteria

- Admin/supervisor no longer sees or can execute direct viaticum registration.
- A collector can request a viaticum for today with amount and justification.
- The collector and reviewers see pending, approved, and rejected states with rejection reason.
- Approval creates one linked `allowance` inflow and updates expected cash; rejection creates none.
- RLS prevents cross-portfolio collector access and reviewer-only decisions remain enforced.

## Tasks

- [x] **ARW-1 — Persist and secure viaticum requests**
  - Add an auditable request table with RLS, least-privilege grants, indexes, and pending uniqueness.
  - Add collector request and reviewer decision RPCs.
  - Make approval atomically create and link an `allowance` cash movement.
  - Add pgTAP allow/deny and accounting assertions.

- [x] **ARW-2 — Extend application contracts**
  - Add typed request models and repository methods.
  - Map requests into collector/admin daily cash data.
  - Extend store mutations and adapter/store tests.

- [x] **ARW-3 — Add collector viaticum request UX**
  - Add a request dialog with amount and justification.
  - Show request status and rejection reason in the collector cash-closure view.

- [x] **ARW-4 — Add reviewer decision UX**
  - Remove direct `Registrar viático` and its allowance form path.
  - Show pending requests with approve/reject actions for admin/supervisor.
  - Preserve opening, operating-expense review, and closure validation.

- [x] **ARW-5 — Verify the complete workflow**
  - Run formatting, TypeScript, unit tests, database lint/tests, and production build.
  - Smoke-check representative collector and reviewer states locally.

## Progress

- Verified `allowance` is an inflow that increases expected cash, while `operating_expense` is an
  outflow that reduces it; the existing expense request lifecycle cannot safely represent viaticums.
- Verified direct allowance registration currently calls `register_cash_allowance` from the admin
  screen and no collector allowance-request persistence exists.
- Added `cash_allowance_requests` with RLS and auditable collector/reviewer identities.
- Added transactional request/review RPCs; approval creates exactly one linked `allowance` inflow,
  while direct authenticated execution of `register_cash_allowance` is revoked.
- Extended the model/repository/adapter/store contracts and both role views with the new lifecycle.
- Fixed day aggregation so a pending request remains visible even when the collector has no prior
  cash movement for that date.
- Removed the direct admin/supervisor `Registrar viático` action; reviewers now only decide
  collector-originated requests.

## Verification evidence

- `pnpm supabase db lint --local --level error` — passed with no findings.
- `pnpm supabase test db` — 19 files and 421 assertions passed.
- Generated `src/app/core/supabase/database.types.ts` from the migrated local schema.
- TypeScript `tsc --noEmit -p tsconfig.app.json` — passed.
- Angular/Vitest suite — 25 files and 185 tests passed.
- Production build — passed; retained the pre-existing initial-bundle and CommonJS warnings.
- `git diff --check` — passed.
- Browser smoke was attempted but the local seeded collector accounts were blocked by the existing
  forced-PIN state, so no end-to-end mutation was claimed; compile, unit, adapter, RPC, RLS, and
  accounting checks cover the workflow.

## Next step

Apply the migration to the intended non-local environment only after the user explicitly authorizes
that remote destination and operation.
