# Loan admin payments and Monday-Saturday schedule

## Objective

Allow daily loan schedules to collect from Monday through Saturday, make audited edit reasons faster and consistent, and let administrators register a payment from any loan detail page regardless of the assigned collector.

## Problem

Daily schedules currently skip both Saturday and Sunday, the edit form requires every reason to be typed manually, and the admin loan detail page can only display payment history even though the transactional payment RPC already authorizes administrators across portfolios.

## Why

The collection calendar must match the business operation, audit reasons should remain explicit without unnecessary typing, and administrators need to receive payments for any customer while preserving the assigned collector, allocation, cash-ledger, and audit rules.

## Authorized scope

- Generate new and replacement daily schedules on Monday through Saturday, skipping Sunday only.
- Repair existing active daily schedules so their active installments follow Monday through
  Saturday immediately; preserve installment IDs, amounts, payments, allocations, and audit every
  due-date correction.
- Replace the free-form-only edit reason with predefined reasons: `Error en el importe`, `Error en la tasa`, `Error en el número de cuotas`, and `Otro`.
- Require a custom justification when `Otro` is selected and send the resolved text to the existing audited update RPC.
- Add an admin payment action to the routed loan detail page.
- Register the payment through the existing transactional `register_payment` RPC, which authorizes admins and supervisors independently of portfolio assignment while retaining the customer's assigned collector on payment and cash-ledger records.
- Refresh the loan detail, schedule, balance, status, and payment history after a successful payment.

## Constraints

- Angular 22, Signal Forms, PrimeNG Aura, Tailwind CSS 4, Spanish UI, and `es-PE` locale.
- Financial writes remain transactional PostgreSQL RPCs.
- Existing RLS, explicit in-function authorization, allocation ordering, ledger consistency, and auditability must remain intact.
- Payments cannot exceed the outstanding balance and cannot be registered against a non-active loan.
- Existing schedules and payment history must not be physically rewritten or deleted.
- Use pnpm exclusively.
- Do not create a Git commit for LOAN-8, per the user's explicit instruction.

## Delivery

- Strategy: `ask-on-risk`.
- Forecast: approximately 1,900 authored changed lines across the schedule migration, pgTAP/Vitest coverage, typed repository/store operations, and responsive payment/edit UI.
- Chain strategy: reuse `feature-branch-chain` on the existing `felix` branch, as previously selected for the loans feature.
- Running authored changed lines: 2,314 through local LOAN-9 (task-document bookkeeping excluded).
  LOAN-9 is a 414-line atomic PostgreSQL function replacement; splitting it would leave an
  incomplete `admin_create_loan` definition. It remains uncommitted by explicit user request.
- Pull request slices: slice 1 candidate contains `b008c3f`; slice 2 candidate contains `dadf23c`; slice 3 candidate contains `e887eaa`; none created because remote delivery remains user-owned.

## Testing mode

- TDD: off.
- Source: no project/session TDD setting or explicit user choice exists; tests are ordinary functional verification.
- Unit runner: `pnpm test:ci`.
- Database runner: `pnpm supabase test db`.
- RDD: disabled/unmanaged (clone-local effective mode is off; the status command also reported a repository-identity access warning).

## Tasks

- [x] **LOAN-5 — Generate daily schedules from Monday through Saturday**
  - Add a versioned migration replacing the admin create/update schedule generators so only Sunday is skipped.
  - Update pgTAP and TypeScript calculation coverage for Saturday and Sunday boundaries.
  - Acceptance: daily schedules may contain Saturday, never contain Sunday, and weekly/monthly behavior remains unchanged.
  - Checks: local database reset, pgTAP suite, focused Vitest coverage, generated type review, and database lint.
  - Evidence: the versioned create/update functions now skip ISO weekday 7 only; create and replacement schedules accept Saturday and advance from Saturday to Monday. Function signatures did not change, so generated Supabase types remain current.
  - Runtime harness: local reset applied every migration; pgTAP passed 5 files / 99 tests; Vitest passed 6 files / 22 tests; database lint reported no schema errors.
  - Rollback boundary: revert the new migration and its schedule assertions before deployment; existing schedules are intentionally not backfilled.
  - RDD: disabled/unmanaged.
  - Work-unit commit: `b008c3f` (`feat(loans): collect daily installments through Saturday`).

- [x] **LOAN-6 — Add predefined audited edit reasons**
  - Add a reason selector with the three requested messages plus `Otro`.
  - Show and require a custom justification only for `Otro`.
  - Resolve the selected/custom reason into the existing `UpdateLoanInput.reason` value.
  - Acceptance: predefined reasons can be saved directly; `Otro` cannot be saved without a non-blank custom justification.
  - Checks: focused Vitest coverage, Angular build, and responsive UI smoke verification.
  - Evidence: the edit page now exposes the three requested audit messages plus `Otro`; custom justification appears and becomes required only for `Otro`, and the resolved trimmed message is sent through the existing audited update contract.
  - Runtime harness: Vitest passed 7 files / 24 tests; Angular build passed; a 390×844 Chromium scenario verified every option, conditional justification, disabled/enabled save states, and switching back to a predefined reason.
  - Rollback boundary: revert the loan-detail edit-form reason controls and tests; no database rollback is required.
  - RDD: disabled/unmanaged.
  - Work-unit commit: `dadf23c` (`feat(loans): add predefined edit reasons`).

- [x] **LOAN-7 — Register administrator payments from loan detail**
  - Add typed payment input/result contracts and a repository method for `register_payment`.
  - Add store payment state that treats the committed RPC result separately from subsequent refresh failures.
  - Add a responsive payment action/form with amount, method, notes, quick amounts, balance preview, and success feedback.
  - Add pgTAP proof that an administrator can register a payment for another collector's portfolio while the payment remains attributed to that assigned collector.
  - Acceptance: an administrator can register a valid payment for any visible active loan, receives clear validation errors, and sees the refreshed balance, schedule, status, and history without creating duplicate payments.
  - Checks: pgTAP, focused Vitest coverage, Angular build, and mobile/desktop payment smoke verification.
  - Evidence: the typed repository calls the existing transactional `register_payment` RPC; the store returns a committed payment result even if a subsequent refresh fails; the responsive detail page now provides payment amount, quick amounts, method, notes, remaining-balance preview, and success state.
  - Runtime harness: pgTAP proved an admin can pay another collector's portfolio while the assigned collector and actual admin actor remain distinct; Vitest passed 7 files / 30 tests; Angular build passed; Chromium passed mobile payment submission plus desktop form usability.
  - Rationale: the data contract, store semantics, UI, and security proof remain one coherent financial work unit; splitting them would leave an intermediate commit without an operable or safely verified payment path.
  - Rollback boundary: revert the typed payment operation and loan-detail payment UI; the existing database RPC remains independently usable.
  - RDD: disabled/unmanaged.
  - Work-unit commit: `e887eaa` (`feat(loans): let admins register client payments`).

- [x] **LOAN-8 — Repair existing active daily schedules through Saturday**
  - Add a versioned migration that corrects the active installment dates of existing active daily
    loans using their stored first due date as the anchor.
  - Skip Sunday only; do not consult or exclude public holidays.
  - Preserve installment IDs, numbers, amounts, payment allocations, and superseded history.
  - Record every corrected due date through the existing installment audit trigger.
  - Keep the repair idempotent so already-correct Monday-through-Saturday schedules do not change.
  - Acceptance: legacy Monday-through-Friday schedules gain Saturday collection dates, Sunday
    remains excluded, weekday holidays remain collection dates, and financial rows are preserved.
  - Checks: local migration application/reset, focused pgTAP coverage, full database tests, and
    database lint.
  - Evidence: the migration recognizes the exact legacy Monday-through-Friday sequence, updates
    only active installments in number order, and rejects inconsistent schedules rather than
    guessing. It preserves installment/payment/allocation identities and uses the existing audit
    trigger for each due-date change. Correct schedules are a no-op on rerun.
  - Runtime harness: the migration applied incrementally and through a complete local reset;
    pgTAP passed 6 files / 118 tests; database lint reported no schema errors. It was deployed to
    the authorized `Cobranza Pro Dev` UAT project on 2026-10-21, and the post-deployment query found
    zero active daily schedule mismatches.
  - Rollback boundary: the new schedule-repair migration and focused pgTAP test.
  - RDD: disabled/unmanaged.
  - Commit: intentionally omitted at the user's request.

- [x] **LOAN-9 — Reassert Monday-Saturday generation for new daily loans**
  - Add a new versioned migration that replaces `admin_create_loan` again so environments that
    retained or restored the legacy Monday-Friday function receive a fresh applicable migration.
  - Keep Saturday as a valid first and subsequent due date; skip only Sunday.
  - Preserve the RPC signature, authorization, financial calculations, installment rounding, and
    cash-ledger behavior.
  - Acceptance: creating a new daily loan across a Friday/Saturday/Sunday boundary produces Friday,
    Saturday, Monday, and Tuesday due dates.
  - Checks: incremental local migration, pgTAP suite, and database lint.
  - Evidence: a fresh migration version replaces `admin_create_loan` even in an environment where
    the earlier migration is already marked as applied. The RPC keeps Saturday (`isodow = 6`) and
    advances only past Sunday (`isodow = 7`), without changing its signature or financial behavior.
  - Runtime harness: incremental local migration applied; pgTAP passed 7 files / 128 tests,
    including creation of a new daily loan with Saturday due dates; database lint reported no
    schema errors; `git diff --check` passed with existing LF/CRLF warnings only. UAT deployment
    succeeded, remote migration history matches local history, and the dumped remote function has
    two Sunday-only guards (`isodow = 7`) and no Saturday guard (`isodow = 6`).
  - Rollback boundary: the fresh `admin_create_loan` replacement migration.
  - RDD: disabled/unmanaged.
  - Commit: intentionally omitted because the user requested no commit.

## Progress

- Verified through CodeGraph and source inspection that daily create/update generators currently skip ISO weekdays 6 and 7.
- Verified that the existing `register_payment` RPC already permits admins and supervisors to pay any active loan while collectors remain portfolio-restricted.
- Verified that the RPC records the assigned collector on the payment/cash movement and the authenticated administrator as `created_by`.
- Supabase function/RLS guidance and the October 2026 breaking-change feed were reviewed; no relevant RPC signature break applies, and existing explicit function grants remain necessary.
- LOAN-5 is implemented without backfilling existing schedules; only newly created or explicitly edited eligible loans receive the Monday-through-Saturday calendar.
- LOAN-6 is implemented with a pure reason resolver so the audit text is independently unit-tested from the PrimeNG selector.
- LOAN-7 is implemented on the existing transactional RPC; no new payment migration was needed because administrator cross-portfolio authorization was already enforced correctly in the database.
- Follow-up verification found that new schedules already include Saturday, but the prior migration
  intentionally left existing active schedules unchanged. The application currently targets a
  remote Supabase URL, so a legacy loan can still display the old Monday-through-Friday calendar.
  LOAN-8 changes that earlier preservation decision only for active daily schedules.
- LOAN-8 is implemented locally. It uses the stored first due date as the anchor, skips only ISO
  weekday 7, includes ordinary weekdays regardless of holiday status, and leaves completed,
  voided, weekly, monthly, and superseded schedules unchanged.
- A newly created loan in the target environment still used the legacy Monday-Friday RPC despite
  the committed LOAN-5 migration. LOAN-9 publishes the correct `admin_create_loan` body under a new
  migration timestamp so the remote migration runner cannot skip it as previously applied.
- All schedule migrations were deployed to `Cobranza Pro Dev` UAT. A verified history-only repair
  marked `20261020165847` as applied because its schema already existed remotely; its SQL was not
  replayed. Production was not touched.

## Verification evidence

- CodeGraph index was current and used before targeted filesystem inspection.
- Current branch `felix` was clean at exploration time.
- `pnpm supabase db reset` — passed with the new migration.
- `pnpm supabase test db` — passed; 5 files / 99 tests.
- `pnpm test:ci` — passed; 6 files / 22 tests.
- `pnpm supabase db lint --level warning` — passed with no schema errors.
- `pnpm test:ci` after LOAN-6 — passed; 7 files / 24 tests.
- `pnpm build` after LOAN-6 — passed with the existing initial-bundle budget warning (809.31 kB vs 500 kB). The first build attempt exposed a readonly-array incompatibility with PrimeNG options; the array contract was corrected and the retry passed.
- Temporary mobile Playwright/Chromium edit-reason smoke — passed; the temporary spec was removed after verification.
- `pnpm supabase test db` after LOAN-7 — passed; 5 files / 101 tests.
- `pnpm test:ci` after LOAN-7 — passed; 7 files / 30 tests.
- `pnpm build` after LOAN-7 — passed with the existing initial-bundle budget warning (809.50 kB vs 500 kB).
- Temporary payment Playwright/Chromium smoke — passed; mobile 390×844 submitted and refreshed a payment, and desktop 1280×900 verified the action and form. The temporary spec was removed.
- `pnpm supabase migration up --local` for LOAN-8 — passed.
- Initial LOAN-8 pgTAP run — failed before assertions because the test customer referenced an
  administrator instead of an active collector; the fixture was corrected.
- `pnpm supabase db reset --local` for LOAN-8 — passed and applied all migrations from scratch.
- `pnpm supabase test db` for LOAN-8 — passed 6 files / 118 tests, including repair
  idempotency, Saturday/holiday inclusion, Sunday exclusion, audit evidence, and preserved
  installment/payment-allocation identities.
- `pnpm supabase db lint --local --level error` for LOAN-8 — no schema errors.
- `pnpm supabase migration up --local` for LOAN-9 — applied the fresh creation-RPC migration.
- `pnpm supabase test db` for LOAN-9 — passed 7 files / 128 tests.
- `pnpm supabase db lint --local --level error` for LOAN-9 — no schema errors.
- `pnpm supabase db push --linked --dry-run` — identified exactly five pending migrations after
  repairing the verified history drift.
- `pnpm supabase db push --linked --yes` — applied migrations `20261021010000`, `20261021163406`,
  `20261021200944`, `20261021222800`, and `20261021232400` to `Cobranza Pro Dev` UAT.
- Post-deployment `pnpm supabase migration list --linked` — every local and remote version matched.
- Post-deployment read-only validation — zero active daily schedule mismatches; remote
  `admin_create_loan` skips only Sunday.

## Next step

LOAN-9 is implemented, verified locally, and deployed to the authorized `Cobranza Pro Dev` UAT
project. Production was not touched. The local changes remain uncommitted as explicitly requested;
the next step is user acceptance testing with a newly created daily loan.
