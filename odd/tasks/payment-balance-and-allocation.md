# Payment balance and cumulative allocation

## Objective

Ensure consecutive and partial payments accumulate correctly against the selected loan, and make the payment confirmation explicitly show that loan's remaining balance.

## Problem

After registering five separate S/ 4.00 payments against a S/ 120.00 loan, the reported remaining balance was S/ 116.00 instead of S/ 100.00. The confirmation also labels the returned value generically, which can be mistaken for the customer's aggregate outstanding balance.

## Why

Payment allocation is financial state: cumulative payments, advance payments, and partial-installment carryover must be transactional, auditable, and unambiguous to the operator.

## Authorized scope

- Reproduce consecutive payments against the same loan in PostgreSQL tests.
- Fix the transactional payment/allocation logic so every posted payment contributes to the selected loan's outstanding balance.
- Preserve oldest-installment-first allocation: partial amounts remain on the current installment and later payments finish it before advancing.
- Identify the selected loan in payment previews and confirmation feedback.
- Keep customer aggregate balances separate from the selected-loan balance.

## Constraints

- Use a versioned Supabase migration for database behavior changes; do not edit applied migrations.
- Preserve payment and allocation history; do not delete or rewrite financial records.
- Keep row locking, authorization, RLS, ledger writes, and auditability intact.
- Angular 22, Signal Forms, PrimeNG, Spanish UI, `es-PE`, and WCAG AA.
- Use pnpm exclusively.

## Delivery

- Strategy: `ask-on-risk`.
- Forecast: approximately 1,000 authored changed lines across the auditable allocation repair,
  replacement RPC, pgTAP coverage, UI copy, and focused tests.
- Chain strategy: reuse `feature-branch-chain` on the existing `felix` branch, as selected for
  the referenced loans work.
- Running authored changed lines: 957 through PAY-2 (generated types and task-document
  bookkeeping excluded).
- Pull request slices: slice 1 candidate contains `9a085e6`; its versioned migration cannot be split
  without separating the transactional fix, historical repair, and the tests that prove them,
  so a `size:exception` is recommended if a PR is created. Slice 2 candidate contains `4e324cb`.

## Testing mode

- TDD: off.
- Source: no project/session TDD setting or explicit user choice exists.
- Unit runner: `pnpm test:ci`.
- Database runner: `pnpm supabase test db`.
- RDD: disabled/unmanaged based on the existing feature configuration.

## Tasks

- [x] **PAY-1 — Make consecutive and partial payments cumulative**
  - Add a pgTAP scenario with five separate S/ 4.00 payments against a S/ 120.00 selected loan.
  - Assert the returned and derived loan balance is S/ 100.00.
  - Assert allocations accumulate, fill the oldest installment first, and carry a partial remainder into the next installment.
  - Correct the RPC/helper through a new migration if the reproduction fails.
  - Checks: incremental local migration, pgTAP suite, and database lint.
  - Evidence: reproduced six failures on an edited loan whose historical and active schedules
    share installment numbers; added a versioned migration that restricts balance/allocation to
    active installments, supersedes and audit-logs erroneous allocations, rebuilds posted-payment
    allocations oldest-first, and exposes partial installment state.
  - Runtime harness: pgTAP passed 5 files / 108 tests and database lint reported no schema errors.
    The migration was applied incrementally to the local database.
  - Rollback boundary: the new payment-balance migration and its focused pgTAP assertions.
  - RDD: disabled/unmanaged.
  - Work-unit commit: `9a085e6` (`fix(payments): allocate payments to active schedules`).

- [x] **PAY-2 — Clarify selected-loan balance in payment feedback**
  - Label the preview and confirmation as the balance of the selected loan.
  - Include a stable loan identifier that helps the operator distinguish it from the customer's aggregate debt.
  - Add focused UI/unit coverage where practical.
  - Checks: `pnpm test:ci`, `pnpm build`, and a responsive payment-dialog smoke scenario.
  - Evidence: the form, balance preview, and success confirmation explicitly identify the selected
    loan with an eight-character reference and no longer use an ambiguous general-balance label.
  - Runtime harness: Vitest passed 7 files / 30 tests; Angular build passed; temporary Chromium
    smoke scenarios passed at 390×844 and 1280×900 and were removed after verification.
  - Rollback boundary: selected-loan payment feedback copy and its focused coverage.
  - RDD: disabled/unmanaged.
  - Work-unit commit: `4e324cb` (`fix(loans): identify selected loan payment balance`).

- [ ] **PAY-3 — Reconcile the loan summary with posted payment history**
  - Derive the selected-loan summary from every posted payment in its loaded history, regardless
    of how many payments share the same business date.
  - Exclude voided payments and keep the displayed balance, payment limits, preview, and
    confirmation consistent with that derived amount.
  - Add focused unit coverage for repeated same-day payments and voided-payment exclusion.
  - Checks: `pnpm test:ci`, `pnpm build`, and focused responsive smoke verification.
  - Rollback boundary: pure payment-summary calculation and its loan-detail consumers.
  - RDD: disabled/unmanaged.

## Progress

- CodeGraph traced the Angular payment flow from the loan detail page through `LoansStore` and `SupabaseLoanRepository` to `register_payment`.
- The RPC returns `remaining_balance` computed from the selected `p_loan_id`; the current UI labels it only as `Nuevo saldo pendiente`.
- Existing pgTAP coverage proves one full payment and one administrative payment, but does not cover repeated payments, advance payments, or partial-installment carryover.
- The failing reproduction proved the root cause: `register_payment` and
  `private.loan_outstanding` still included preserved historical installments after audited loan
  editing, while the UI balance view included only the active schedule.
- The migration preserves erroneous allocation rows as superseded audit evidence and rebuilds
  posted allocations against the active schedule without modifying payment or cash-ledger rows.
- Five separate S/ 4.00 payments now return S/ 116.00, 112.00, 108.00, 104.00, and 100.00.
- A S/ 2.00 partial payment leaves S/ 2.00 on the current installment; the following S/ 6.00
  completes that remainder before advancing S/ 4.00 to the next installment.
- The payment dialog now shows `Préstamo #<referencia>` and labels both preview and confirmation as
  the balance of that selected loan.
- Follow-up evidence from the user shows the detail history can contain seven or eight payments
  while the installment-derived summary still shows only one S/ 4.00 reduction. PAY-3 therefore
  treats posted payment history as the immediate source for the selected-loan summary while the
  schedule remains the allocation breakdown.

## Verification evidence

- `pnpm supabase test db` before the fix — failed 6 of 20 financial RPC assertions.
- `pnpm supabase migration up --local` — migration applied successfully.
- `pnpm supabase test db` after the fix — passed 5 files / 108 tests.
- `pnpm supabase db lint --local --level error` — no schema errors.
- `pnpm test:ci` — passed 7 files / 30 tests after rerunning outside the filesystem sandbox.
- `pnpm build` — passed; existing initial bundle warning remains (809.50 kB vs 500 kB).
- Temporary Chromium payment-dialog smoke — passed mobile 390×844 and desktop 1280×900; the
  temporary spec was removed.

## Next step

Implement PAY-3 and verify the selected-loan summary reflects all posted same-day payments.
Remote push and pull-request creation remain user-owned decisions.
