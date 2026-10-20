# Loan schedule and editing

## Objective

Complete the administrative loan module with a Supabase-backed payment schedule, audited editing, and loan start/end dates in the schedule summary.

## Problem

The current loan screen only lists and creates loans. It cannot show installment-level balances or edit an existing loan. Editing financial terms must keep the loan, schedule, cash ledger, and audit trail consistent.

## Why

Administrators need to inspect the customer's real payment schedule and correct an active loan before any payment is recorded. The installment count is editable and must recalculate installment amounts without deleting financial history.

## Authorized scope

- Show the payment schedule from `installment_balances` in the admin loan module.
- Show loan start and end dates in the schedule summary.
- Edit principal, interest rate, frequency, installment count, and start date.
- Allow editing only while the loan is active and has no payment history.
- Require an audit reason for every edit.
- Preserve superseded installments instead of physically deleting them.
- Keep the loan disbursement cash movement consistent when principal changes.

## Constraints

- Angular 22, Signal Forms, PrimeNG Aura, Tailwind CSS 4, Spanish UI, `es-PE` locale.
- Financial writes are transactional PostgreSQL RPCs.
- RLS remains the read boundary; privileged RPCs must authenticate and authorize administrators explicitly.
- Payment and installment history must not be physically deleted.
- No edit may invalidate a submitted cash closure associated with the original disbursement.
- Use pnpm exclusively.

## Delivery

- Strategy: `ask-on-risk`
- Forecast: approximately 900 authored changed lines across SQL, tests, types, repository/store, and UI.
- Chain strategy: `feature-branch-chain` on the existing `felix` branch.
- Running authored changed lines: 937 (`d2130b9`; 27 generated `database.types.ts` lines excluded).
- Pull request slices: slice 1 candidate contains `d2130b9`; no pull request created because remote delivery remains user-owned.

## Testing mode

- TDD: off
- Source: no project/session TDD setting or explicit user choice exists; the presence of Vitest/pgTAP does not enable TDD.
- Unit runner: `pnpm test:ci`
- Database runner: `pnpm supabase test db`
- RDD: disabled/unmanaged (clone-local effective mode is off).

## Tasks

- [x] **LOAN-1 — Add transactional and audited loan schedule replacement**
  - Add installment supersession metadata and active-only uniqueness.
  - Add `admin_update_loan` with admin authorization, row locking, active/no-payment checks, audit reason, schedule regeneration, and cash-ledger consistency.
  - Protect closed cash periods from principal corrections.
  - Extend pgTAP coverage and regenerate database types.
  - Acceptance: edits preserve old installments, expose only the replacement schedule, recalculate rounding correctly, and reject unsafe callers/states.
  - Checks: `pnpm supabase db reset`, `pnpm supabase test db`, generated type diff review.
  - Evidence: local database reset applied every migration; pgTAP passed 5 files / 86 tests; generated Supabase types compile; the new RPC has no db-lint warnings. The linter still reports the two pre-existing shadow/unused-loop warnings in `admin_create_loan`.
  - Runtime harness: local Supabase PostgreSQL reset plus pgTAP RPC scenarios passed.
  - Rollback boundary: remove `20261020181747_update_loan_schedule.sql` and revert its pgTAP/schema assertions and generated type additions before the migration is deployed.
  - RDD: disabled/unmanaged.
  - Work-unit commit: `d2130b9` (`feat(loans): add audited schedule updates`).

- [x] **LOAN-2 — Expose schedule and update operations through the Angular data layer**
  - Add schedule/update models and repository methods.
  - Implement Supabase mapping and domain error translation.
  - Extend the loan store with schedule loading and update state.
  - Acceptance: typed repository/store APIs load ordered installment balances and refresh the list after a successful edit.
  - Checks: focused Vitest suite and TypeScript build.
  - Evidence: repository and store APIs cover ordered installment loading, partial-status normalization, audited updates, list refresh, selected-schedule refresh, and translated domain errors; `pnpm test:ci` passed 5 files / 19 tests and `pnpm build` passed.
  - Rollback boundary: revert the loan model/repository/store API additions and their focused tests; no database rollback is required for this work unit.
  - RDD: disabled/unmanaged.
  - Work-unit commit: pending.

- [ ] **LOAN-3 — Build accessible schedule and edit experiences**
  - Add row actions for viewing the schedule and editing eligible loans.
  - Show the MVP schedule columns and summary values, including start/end dates.
  - Reuse the loan form for audited editing, with immutable client and eligibility guidance.
  - Acceptance: admin can view the real schedule, distinguish paid/partial/overdue/pending installments, and edit eligible loans with a reason.
  - Checks: focused Vitest suite, `pnpm build`, and a runtime UI smoke scenario when the local stack is available.
  - Evidence: pending.

## Progress

- Exploration completed against the two MVP HTML files, README, migration guide, current Angular module, generated Supabase types, and all loan-related migrations.
- Confirmed that the MVP contains schedule viewing but no editing behavior; the editing rules above come from the user's explicit decision and financial-integrity constraints.

## Verification evidence

- CodeGraph initialized and used before filesystem exploration; index was current at exploration time.
- Supabase changelog and current RLS/function privilege guidance checked on 2026-10-20.
- `pnpm supabase db reset` — passed; all migrations applied on local PostgreSQL 17.
- `pnpm supabase test db` — passed; 5 files and 86 tests.
- `pnpm supabase db lint --level warning` — new `admin_update_loan` clean; existing `admin_create_loan` has two prior loop-variable warnings.
- `pnpm test:ci` — passed; 5 files and 19 tests.
- `pnpm build` — passed with the pre-existing initial-bundle budget warning (784.35 kB vs 500 kB).

## Next step

Commit LOAN-2, then implement LOAN-3 UI as the next feature-branch-chain slice.
