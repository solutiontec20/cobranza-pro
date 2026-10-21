# Loan admin payments and Monday-Saturday schedule

## Objective

Allow daily loan schedules to collect from Monday through Saturday, make audited edit reasons faster and consistent, and let administrators register a payment from any loan detail page regardless of the assigned collector.

## Problem

Daily schedules currently skip both Saturday and Sunday, the edit form requires every reason to be typed manually, and the admin loan detail page can only display payment history even though the transactional payment RPC already authorizes administrators across portfolios.

## Why

The collection calendar must match the business operation, audit reasons should remain explicit without unnecessary typing, and administrators need to receive payments for any customer while preserving the assigned collector, allocation, cash-ledger, and audit rules.

## Authorized scope

- Generate new and replacement daily schedules on Monday through Saturday, skipping Sunday only.
- Do not rewrite existing schedules automatically; historical and already-agreed due dates remain unchanged unless an eligible unpaid loan is explicitly edited.
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

## Delivery

- Strategy: `ask-on-risk`.
- Forecast: approximately 1,900 authored changed lines across the schedule migration, pgTAP/Vitest coverage, typed repository/store operations, and responsive payment/edit UI.
- Chain strategy: reuse `feature-branch-chain` on the existing `felix` branch, as previously selected for the loans feature.
- Running authored changed lines: 758 through LOAN-5 (task-document bookkeeping excluded).
- Pull request slices: slice 1 candidate contains `b008c3f`; none created because remote delivery remains user-owned.

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
  - Work-unit commit: pending.

- [ ] **LOAN-7 — Register administrator payments from loan detail**
  - Add typed payment input/result contracts and a repository method for `register_payment`.
  - Add store payment state that treats the committed RPC result separately from subsequent refresh failures.
  - Add a responsive payment action/form with amount, method, notes, quick amounts, balance preview, and success feedback.
  - Add pgTAP proof that an administrator can register a payment for another collector's portfolio while the payment remains attributed to that assigned collector.
  - Acceptance: an administrator can register a valid payment for any visible active loan, receives clear validation errors, and sees the refreshed balance, schedule, status, and history without creating duplicate payments.
  - Checks: pgTAP, focused Vitest coverage, Angular build, and mobile/desktop payment smoke verification.
  - Rollback boundary: revert the typed payment operation and loan-detail payment UI; the existing database RPC remains independently usable.
  - RDD: disabled/unmanaged.
  - Work-unit commit: pending.

## Progress

- Verified through CodeGraph and source inspection that daily create/update generators currently skip ISO weekdays 6 and 7.
- Verified that the existing `register_payment` RPC already permits admins and supervisors to pay any active loan while collectors remain portfolio-restricted.
- Verified that the RPC records the assigned collector on the payment/cash movement and the authenticated administrator as `created_by`.
- Supabase function/RLS guidance and the October 2026 breaking-change feed were reviewed; no relevant RPC signature break applies, and existing explicit function grants remain necessary.
- LOAN-5 is implemented without backfilling existing schedules; only newly created or explicitly edited eligible loans receive the Monday-through-Saturday calendar.
- LOAN-6 is implemented with a pure reason resolver so the audit text is independently unit-tested from the PrimeNG selector.

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

## Next step

Commit LOAN-6, record its identity, and implement administrator payment registration in LOAN-7.
