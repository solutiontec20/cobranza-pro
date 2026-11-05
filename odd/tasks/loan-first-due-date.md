# Loan first due date

## Objective

Ensure every loan schedule starts after the disbursement date: daily loans on the next collectible
day, weekly loans seven days later, and monthly loans one month later.

## Problem

The shared Angular helper returned the start date for weekly/monthly loans and returned the same day
for daily loans unless that date was Sunday. PostgreSQL RPCs mirrored that behavior, so the first
installment could be due on the day the money was lent.

## Why

The disbursement day is not a collection day. A loan issued on Saturday 2026-10-31 must start daily
collection on Monday 2026-11-02 because Sunday is skipped; a weekly loan issued that Saturday must
start on Saturday 2026-11-07.

## Authorized scope

- Daily: start from the following calendar day, then skip Sunday only.
- Weekly: first installment exactly seven days after the loan start date.
- Monthly: first installment one calendar month later, preserving the established Sunday adjustment.
- Apply the same rule to admin creation/update, collector creation, and loan renewal.
- Repair active schedules already created with an incorrect first due date while preserving row IDs,
  payment history, allocations, superseded history, and auditability.

## Constraints

- Use a new versioned Supabase migration; do not edit applied migrations.
- PostgreSQL remains the authoritative enforcement boundary; frontend previews must match it.
- Daily collection remains Monday through Saturday, including holidays.
- Preserve existing financial amounts, installment numbers, payments, and allocations.
- Use pnpm exclusively.
- Do not create a Git commit, following the user's standing instruction for this work.
- Do not deploy remotely without separate destination/session authorization.

## Delivery

- Strategy: `ask-on-risk`.
- Forecast: approximately 500 authored changed lines.
- Actual working-tree scope: approximately 867 implementation/test changed lines, plus this recovery
  document. The focused database proof is larger than forecast because it covers five financial RPC
  paths, in-place repair identity, allocations, and audit rows as one coherent boundary.
- Chain strategy: `feature-branch-chain` only if commits are later authorized; no commit was created.

## Testing mode

- TDD: off; no explicit project/session TDD setting exists.
- Unit runner: `pnpm test:ci`.
- Database runner: `pnpm supabase test db`.
- RDD: disabled/unmanaged.

## Tasks

- [x] **DUE-1 - Enforce and repair first due dates in PostgreSQL**
  - Added centralized private due-date functions and table-boundary triggers used by every current RPC.
  - Added an in-place repair for active loans/installments that preserves financial row identities.
  - Proved daily Saturday-to-Monday, weekly +7 days, monthly +1 month, RPC coverage, allocations,
    and auditability with pgTAP.
  - Checks: incremental local migration PASS; focused pgTAP 29/29 PASS; full pgTAP 317/317 PASS;
    database lint PASS. Local reset intentionally skipped because the additive migration, focused
    migration test, and complete suite passed without destroying the developer's local data.
  - Rollback boundary: `20261031154121_enforce_first_due_after_disbursement.sql` and
    `loan_first_due_date_test.sql`.
  - RDD: disabled/unmanaged.
  - Commit: intentionally omitted by user request.

- [x] **DUE-2 - Align frontend previews and verify all callers**
  - Updated the shared pure `firstDueOn` helper used by admin and collector forms.
  - Added daily, weekly, monthly, Sunday, and month-end unit coverage and corrected obsolete tests.
  - Checks: Angular/Vitest 137/137 PASS; Angular production build PASS with existing bundle/CommonJS
    warnings; `git diff --check` PASS with one line-ending warning.
  - Rollback boundary: shared date helper, focused unit tests, and expectation corrections.
  - RDD: disabled/unmanaged.
  - Commit: intentionally omitted by user request.

- [x] **DUE-3 - Make renewal collection start explicit in the UI**
  - Rename every loan start-date input/summary label so users understand it is the loan/disbursement
    date, not the first installment date.
  - Show the calculated first payment date before confirmation in both admin and collector renewal
    dialogs.
  - Show the actual first scheduled installment as the collection start in loan detail summaries.
  - Implemented: every affected form now says `Fecha del préstamo`; renewal summaries show the
    calculated `Primer pago`; admin and collector details show the real first scheduled installment
    as `Inicio de cobro`.
  - Checks: exact 2026-10-31 -> 2026-11-02 calculation remains covered; complete Vitest suite
    137/137 PASS; Angular production build and template/type compilation PASS. Browser CLI visual
    automation was skipped because neither `agent-browser` nor `playwright-cli` is installed.
  - Rollback boundary: admin and collector loan-detail components/templates.
  - RDD: disabled/unmanaged.
  - Commit: intentionally omitted by user request.

- [x] **DUE-4 - Deploy and verify the due-date migration in authorized UAT**
  - Confirm the linked project is exactly Cobranza Pro Dev (`idwbhwfyfvyaqsefvlnc`).
  - Apply only the pending first-due migration with the currently authenticated Supabase CLI session.
  - Verify migration history and database invariants without touching production.
  - Checks: linked project ref matched `idwbhwfyfvyaqsefvlnc`; dry-run listed only the authorized
    migration; remote push PASS; local/remote histories aligned; read-only UAT verification returned
    zero active loans with a non-future first due date, zero active loan date mismatches, and zero
    active installment date mismatches. The exact remote example returned daily 2026-11-02 and
    weekly 2026-11-07 for a 2026-10-31 loan date.
  - Rollback boundary: migration `20261031154121_enforce_first_due_after_disbursement.sql`.
  - RDD: disabled/unmanaged.
  - Commit: intentionally omitted by user request.

## Progress

- PostgreSQL now derives due dates from `started_on`, `frequency`, and installment number at the
  schema boundary instead of trusting individual RPC inputs.
- Active schedules are repaired in place; loan, installment, payment, and allocation identities are
  preserved, and the financial amounts are not changed.
- Existing reporting, dashboard, blacklist, collector, and repair fixtures were realigned to the new
  future-first-installment rule without weakening their original assertions.
- DUE-3 was reopened after the user clarified that renewal screens must visibly distinguish the loan
  date from the following first collection date before the renewal is submitted.
- Loan creation, editing, renewal, admin detail, and collector detail now use distinct labels for
  `Fecha del préstamo`, `Primer pago`, and `Inicio de cobro`; no display-only date normalization was
  added, so the detail continues to show the authoritative installment date returned by Supabase.
- UAT contained an already-applied migration absent from the checkout
  (`20261031103541_client_list_pagination_indexes.sql`). Its exact two statements were read from the
  remote migration ledger and mirrored locally before deployment; no remote history repair was used.
- Migration `20261031154121_enforce_first_due_after_disbursement.sql` is now applied in the authorized
  UAT project, and its repair updated active schedules in place.
- `REQUERIMIENTO.md` is referenced by repository guidance but is not present in the checkout; the
  user's explicit rule is the authoritative evidence for this correction.

## Verification evidence

- Daily example: 2026-10-31 -> 2026-11-02.
- Weekly example: 2026-10-31 -> 2026-11-07.
- Monthly schedules advance one calendar month and retain the Sunday rollover rule.
- Database: focused 29/29 and complete 317/317 pgTAP assertions passed; lint returned no errors.
- Frontend: 19 files and 137 Vitest assertions passed; production build completed.
- Initial checks exposed two environment-only issues: no active NVM version and sandbox access
  denial. Re-running with the installed Node binary outside the sandbox passed.

## Next step

Validate the corrected schedule through the application with a newly created or renewed daily loan.
