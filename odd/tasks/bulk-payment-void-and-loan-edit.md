# Bulk payment voiding and loan edit eligibility

## Objective

Allow administrators and supervisors to void multiple posted payments from one loan in a single,
audited transaction, and make loan editing available again only after no posted payment remains.

## Problem

The loan detail currently voids one payment per operation. Both the Angular edit control and the
`admin_update_loan` RPC also treat any historical payment row as blocking, so voided payments keep
the loan permanently non-editable even though they no longer affect its balance.

## Why

An administrator may need to reverse many erroneous payments before correcting the loan. Repeating
the operation payment by payment is slow and risks leaving the financial state half-corrected if the
process is interrupted.

## Authorized scope

- Add responsive multi-selection for posted payments inside one admin/supervisor loan detail.
- Preserve selection across the existing payment-history pages and filters.
- Show the selected count, selected amount, and how many posted payments will remain.
- Confirm the batch with one audited predefined/custom reason.
- Add one atomic PostgreSQL RPC that voids all selected payments or none.
- Preserve each payment row, allocation history, audit metadata, and one reversing cash movement per
  payment.
- Allow loan editing only when the loan is active and has zero posted payments.
- Keep collector correction requests and individual admin/supervisor payment voiding behavior intact.

## Constraints

- Financial writes and authorization remain in PostgreSQL; the frontend must not loop independent
  void operations.
- Only administrators and supervisors may void payments directly.
- The batch may contain only unique, posted payments from the displayed loan.
- A partial batch must keep editing disabled while any posted payment remains.
- New database behavior must use an additive Supabase migration; applied migrations stay immutable.
- UI language is Spanish, mobile-first, keyboard accessible, and WCAG AA compatible.
- Use pnpm exclusively and do not perform remote operations.
- Do not create commits, following the user's standing instruction.

## Acceptance criteria

- An administrator/supervisor can select one or many posted payments, including all posted payments,
  from the loan detail on mobile and desktop.
- Confirmation states the selected count and total and requires one valid reason.
- Any invalid payment causes the complete database transaction to roll back.
- Every successfully voided payment retains its record and receives its own void audit fields and
  reverse cash movement.
- The loan balance and status are recalculated once the transaction completes.
- The edit action appears only when the active loan has no posted payments; voided history does not
  block it.
- Collectors cannot call the bulk RPC.

## Delivery

- Strategy: ask-on-risk; no commit/PR slicing applies because commits are explicitly disallowed.
- Forecast: approximately 650 authored changed lines across migration/tests, generated types,
  repository/store contracts, responsive UI, and unit tests.
- RDD: disabled/unmanaged (`gentle-ai review mode status` reported effective off; repository identity
  inspection was unavailable due filesystem permissions).

## Testing mode

- TDD: on.
- Source: `openspec/config.yaml` (`strict_tdd: true`, `apply.tdd: true`).
- Unit runner: `pnpm test:ci`.
- Database runner: `pnpm supabase test db`.
- E2E runner: `pnpm e2e` when the local UI/backend scenario is available.

## Tasks

- [x] **BPV-1 — Specify and implement atomic bulk voiding**
  - Add failing pgTAP scenarios for authorization, atomic rollback, audit/cash reversals, loan
    reopening, and batches containing 20 payments.
  - Add the protected bulk RPC in an additive migration and regenerate database types.
  - Keep existing single-payment behavior compatible.

- [x] **BPV-2 — Correct loan edit eligibility**
  - Add failing Angular and pgTAP cases for posted versus voided payment history.
  - Update the trusted `admin_update_loan` guard and frontend eligibility/copy.
  - Verify correction-request resolution inherits the corrected backend rule.

- [x] **BPV-3 — Add responsive bulk-selection workflow**
  - Add selection state across payment pages/filters, select-all-posted behavior, and accessible
    mobile/desktop controls.
  - Show count, amount, remaining-posted preview, reason form, destructive confirmation, and result.
  - Wire one repository/store call and refresh loan/list state once after success.

- [x] **BPV-4 — Verify the integrated financial workflow**
  - Run targeted and full Angular/Vitest tests, database lint/tests, formatter, and production build.
  - Exercise representative mobile/desktop selection and atomic failure/success scenarios when the
    local runtime is available.
  - Record every passed, failed, skipped, or unavailable check.

## Migration impact

- Adds a protected RPC for bulk payment voiding.
- Replaces `admin_update_loan` with the same signature so only posted payments block editing.
- Does not delete or rewrite historical payment, allocation, ledger, or audit rows.

## Rollback

- Revoke/drop the new bulk RPC and restore the previous `admin_update_loan` definition through a new
  forward migration.
- Remove the frontend batch action while retaining existing individual payment voiding.
- Already committed financial reversals remain immutable audit history and are not silently undone.

## Progress

- Verified that current admin UI and repository support only one payment target per void operation.
- Verified `void_payment` already performs per-payment authorization, locking, audit fields, reverse
  cash movement, balance recalculation, and paid-loan reopening.
- Verified both UI and `admin_update_loan` currently block on any payment history, including voided
  rows.
- Verified collector edit requests already delegate resolution to `admin_update_loan`.
- BPV-1 completed offline: added `void_payments_bulk` with deterministic locks, one-loan and
  posted-payment validation, a 100-payment safety bound, role enforcement, atomic delegation to
  `void_payment`, and one summary result.
- Added 18 pgTAP specifications covering a 20-payment batch, permissions, invalid selections,
  rollback expectations, per-payment audit/reversals, retained allocations, balance, and reopening.
- Updated generated Supabase types manually because regeneration requires a running local database.
- BPV-2 completed: loan editing now checks for posted payments instead of any historical payment;
  voided-only history no longer blocks the Angular action or `admin_update_loan`.
- Added the pure `canEditLoan` rule with active/no-payment, voided-only, posted, and non-active cases.
- Updated the adapter translation and UI explanation to refer specifically to posted payments.
- The existing correction-request resolver continues to call `admin_update_loan`, so it inherits the
  corrected trusted-boundary rule without a second implementation.
- BPV-3 completed: admin/supervisor loan detail now supports immutable multi-selection across pages
  and filters, select/clear-all-posted controls, count/amount/remaining preview, one audited reason,
  and one atomic repository/store call with one refresh.
- Preserved the existing individual void action and added accessible checkbox labels on the mobile
  cards and desktop table.
- BPV-4 completed with every locally available check recorded; database and live visual checks remain
  explicitly unavailable without a PostgreSQL runtime.

## Verification evidence

- BPV-1 RED/GREEN database execution unavailable: PostgreSQL was not running, and the user
  explicitly prohibited Docker. The pgTAP file remains pending execution against an available local
  database; no passing database result is claimed.
- BPV-1 static TypeScript check passed:
  `node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`.
- BPV-1 `git diff --check` passed.
- BPV-1 pgTAP plan and assertion count match at 18; SQL behavior still requires runtime execution.
- BPV-2 focused Angular/Vitest run passed: 2 files, 22 tests.
- BPV-2 application TypeScript check passed and `git diff --check` passed.
- BPV-2 pgTAP runtime remains unavailable without PostgreSQL; the updated SQL specification now
  permits voided-only history and separately rejects a remaining posted payment.
- BPV-3 TDD RED observed before implementation: the focused suite failed because
  `summarizePaymentSelection`, `SupabaseLoanRepository.voidPaymentsBulk`, and
  `LoansStore.voidPaymentsBulk` did not exist.
- BPV-3 focused GREEN passed: 3 files, 51 tests.
- Full Angular/Vitest suite passed: 33 files, 264 tests.
- Application TypeScript check passed: `tsc -p tsconfig.app.json --noEmit`.
- Targeted Prettier check passed for every changed TypeScript, HTML, spec, and task-document file.
  SQL was excluded because this project has no Prettier SQL parser.
- Development and production Angular builds passed. The production build retains the existing
  initial-bundle budget warning (831.69 kB versus 500 kB) and existing CommonJS dependency warnings.
- `git diff --check` passed.
- Database lint and pgTAP runtime checks were skipped because no local PostgreSQL runtime is
  installed and the user explicitly prohibited Docker. The migrations and 53 combined SQL
  assertions remain pending execution in an approved database environment.
- Live mobile/desktop E2E was skipped because the app has no authorized local backend runtime; no
  remote Supabase environment was accessed.
- Engram recovery mirror updates after BPV-1 are pending because the memory transport closed; this
  repository task document is the current recovery source.

## Next step

Apply the two additive migrations and run the pending pgTAP/database-lint checks in an approved
PostgreSQL environment before promoting the feature.
