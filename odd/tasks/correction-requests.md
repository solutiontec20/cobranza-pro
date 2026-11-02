# Correction requests

## Objective

Allow collectors to request audited loan edits, loan voids, and payment voids while keeping every
financial mutation restricted to administrators/supervisors and surfacing pending requests through a
real notification bell and administrative inbox.

## Problem

Collectors currently can only copy payment details to the clipboard. The notification bell is
decorative, payment voiding exists only as a PostgreSQL RPC, loan voiding does not exist, and there is
no persisted request lifecycle for an administrator to review or resolve.

## Why

Field collectors need a safe escalation path without receiving mutation privileges. Administrators
need enough context to locate the exact loan or payment, decide whether the request is valid, execute
the permitted correction transactionally, and leave an auditable resolution.

## Authorized scope

- Request types: edit loan, void loan, and void payment.
- Collectors can create requests only for loans/payments in their own portfolio.
- Collectors cannot edit or void financial records directly.
- Administrators/supervisors can review, reject, or resolve requests.
- Loan voiding never deletes history and is allowed only when the loan has no posted payments.
- Payment voiding reuses the existing audited void_payment behavior.
- Loan editing keeps the existing active-loan and no-payment-history safety rules.
- The notification bell shows a real pending count and links to an administrative request inbox.

## Constraints

- Financial actions and request resolution must complete in one PostgreSQL transaction.
- Preserve loans, installments, payments, allocations, cash movements, and audit history.
- No direct table mutations from the frontend; use RPCs for request creation/resolution.
- Enforce RLS and role checks at the database boundary.
- Keep collector A isolated from collector B.
- Protect admin/collector route namespaces by role as part of this authorization-sensitive feature.
- Use the repository + Supabase adapter + route/store pattern already established in the project.
- UI language is Spanish and must remain mobile-first and WCAG AA compatible.
- Use pnpm exclusively.
- Do not create commits, following the user's standing instruction.
- Do not deploy remotely without separate destination/session authorization.

## Delivery

- Strategy: ask-on-risk.
- Forecast: approximately 1,600 authored changed lines across migration, pgTAP, models, repository,
  adapter, stores, notification UI, collector/admin screens, routes, and unit tests.
- Chain strategy: feature-branch-chain only if commits are later authorized; no commits will be
  created in this scope.
- RDD: disabled/unmanaged.

## Testing mode

- TDD: off; no explicit project/session TDD setting exists.
- Unit runner: pnpm test:ci.
- Database runner: pnpm supabase test db.

## Tasks

- [x] **CR-1 - Persist and secure correction requests**
  - Add the request schema, indexes, RLS, collector creation RPC, admin list/count RPCs, and duplicate
    pending-request protection.
  - Add a transactional resolution RPC for rejection, payment voiding, loan voiding, and edit-request
    acknowledgement after the existing audited admin edit flow.
  - Prove portfolio isolation, role enforcement, lifecycle transitions, cash reversal, and immutable
    financial history with pgTAP.
  - Rollback boundary: additive migration and focused SQL test.
  - Commit: intentionally omitted by user request.

- [x] **CR-2 - Add the correction-request repository and stores**
  - Add models, repository token, Supabase adapter, collector submission store, admin inbox store, and
    shell notification store.
  - Translate PostgreSQL errors through AppError and cover stores/adapters with Vitest.
  - Rollback boundary: core request data layer and feature stores.
  - Commit: intentionally omitted by user request.

- [x] **CR-3 - Build collector request actions**
  - Replace the clipboard-only report flow with persisted request dialogs for the selected loan or
    payment.
  - Confirm persisted submissions and surface duplicate/validation errors without exposing direct
    mutation controls.
  - Rollback boundary: collector client-detail UI.
  - Commit: intentionally omitted by user request.

- [x] **CR-4 - Build admin notifications and resolution inbox**
  - Make the topbar bell show a real pending count and accessible notification panel.
  - Add an admin request inbox with loan/payment context, links, rejection, payment voiding, loan
    voiding, and edit-loan routing.
  - Expose the existing payment-void capability in the admin loan detail.
  - Add role-aware route guards for admin and collector namespaces.
  - Rollback boundary: shell notification UI, admin inbox/detail UI, and route guards.
  - Commit: intentionally omitted by user request.

- [x] **CR-5 - Verify the complete workflow**
  - Run focused and complete pgTAP, database lint, Vitest, Angular build, and applicable browser/e2e
    checks.
  - Record skipped or unavailable checks honestly.
  - Commit: intentionally omitted by user request.

- [ ] **CR-6 - Unblock collector request submission**
  - Allow collectors to submit edit-loan and void-loan requests for any active loan, even when it
    has payment history; financial safety remains enforced when an administrator resolves it.
  - Verify payment, loan-void, and edit request creation against the local RPC contract.
  - Confirm the target environment before applying the migration remotely; the current Angular
    environment points to a remote Supabase project while the correction migration is local-only.
  - Rollback boundary: collector request availability and deployment evidence.
  - Commit: intentionally omitted by user request.

- [x] **CR-7 - Add consistent quick void reasons**
  - Add shared, typed quick-reason catalogs for payment voids and loan voids, ending with `Otro`.
  - Apply the same selection behavior to collector requests, administrative request resolution, and
    direct administrative payment voiding.
  - Require a written explanation only when `Otro` is selected, while preserving free text for edit
    and rejection actions.
  - Cover reason resolution with Vitest and verify the Angular build.
  - Rollback boundary: shared reason catalog and three void dialogs.
  - Commit: intentionally omitted by user request.

- [x] **CR-8 - Add quick reasons to every correction description**
  - Add shared, typed quick-reason catalogs for loan edits and request rejections, ending with
    `Otro`.
  - Apply the edit catalog to collector edit requests, administrative request editing, and direct
    administrative loan editing without overwriting the collector's original request reason.
  - Apply the rejection catalog whenever an administrator rejects a correction request.
  - Keep the existing loan/payment void catalogs and require written text only for `Otro`.
  - Cover catalog resolution and form behavior with Vitest, then verify TypeScript and the Angular
    build.
  - Rollback boundary: shared correction reason catalogs and correction description dialogs.
  - Commit: intentionally omitted by user request.

## Progress

- Verified admin_update_loan already supports admin/supervisor edits only for active loans without
  any payment history and requires an audit reason.
- Verified void_payment already performs audited, transactional payment voiding and cash reversal
  but is not exposed through the Angular repository or UI.
- Verified no loan-void RPC or request/notification persistence exists.
- Verified the current collector Reportar dialog only copies text, and the topbar bell always shows
  a decorative red dot.
- Verified physical loan deletion is blocked and will remain blocked.
- Completed CR-1 with a locked request lifecycle, collector-owned creation, privileged list/count,
  and atomic rejection/edit/payment-void/loan-void resolution wrappers. Loan voiding supersedes the
  active schedule and links an inflow counter-movement to the preserved disbursement.
- Completed CR-2 with typed models, a repository token, Supabase adapter, shared route-level store,
  generated database types, user-facing PostgreSQL error translation, and unit coverage.
- Completed CR-3 by replacing the collector's clipboard-only report with persisted loan edit, loan
  void, and selected-payment void request dialogs.
- Completed CR-4 with a real pending-count bell, recent-request popover, administrative inbox,
  transactional approve/reject actions, direct administrator payment voiding, and role-area guards.
- Completed CR-5 with database, unit, TypeScript, and Angular template/build verification.
- CR-6 local correction: collectors may now submit edit and void requests for any active loan even
  when payments exist. The administrator still cannot execute an unsafe edit/void until the RPC
  business rules are satisfied.
- CR-6 diagnosis: `.env` targets `idwbhwfyfvyaqsefvlnc.supabase.co`, while
  `20261031220000_correction_requests.sql` was only applied locally. A missing remote RPC explains
  why all three submission types fail in the environment being tested.
- Completed CR-7 with shared typed catalogs for payment and loan void reasons. Collector requests,
  administrative request resolution, and direct administrative payment voiding now use the same
  quick-selection behavior; `Otro` is last and requires a written explanation.
- CR-8 authorized: replace the remaining free-text-only edit and rejection descriptions with typed
  quick reasons while preserving separate collector-request and administrator-resolution audit
  context.
- Completed CR-8 with shared edit and rejection catalogs. Collector edit requests, administrative
  edit resolution, direct loan editing, and request rejection now use quick reasons; the original
  collector reason stays visible during administrative resolution and `Otro` requires explanation.

## Verification evidence

- Existing payment void RPC: supabase/migrations/20261019181116_financial_rpcs.sql.
- Existing loan edit RPC: supabase/migrations/20261024150000_allow_supervisor_loan_updates.sql.
- Current collector report: src/app/modules/collector/client-detail/client-detail.{ts,html}.
- Current decorative bell: src/app/shell/topbar/topbar.{ts,html}.
- CR-1 migration: supabase/migrations/20261031220000_correction_requests.sql.
- CR-1 pgTAP: supabase/tests/correction_requests_test.sql — 62/62 focused assertions passed.
- Full database suite: `pnpm supabase test db` — 18 files, 379 tests, all passed.
- Database lint: error-level lint passed with no findings.
- Angular/Vitest: 22 files, 150 tests, all passed.
- TypeScript application check: `tsc -p tsconfig.app.json --noEmit` passed.
- Angular development build passed, including all new templates and lazy routes.
- Dedicated browser/E2E coverage was not added because the repository currently has only the
  unrelated login journey; business, authorization, mapping, store, and template checks passed.
- RDD: disabled/unmanaged; no review receipt was requested or produced.
- Commit: intentionally omitted by user request.
- CR-6 local verification: 62 focused pgTAP assertions, 151 Angular/Vitest tests, TypeScript check,
  and Angular development build passed.
- CR-7 verification: 23 Angular/Vitest files and 154 tests passed; TypeScript application check,
  Angular development build, and `git diff --check` passed.
- CR-8 verification: 24 Angular/Vitest files and 158 tests passed; TypeScript application check,
  Angular development build, Prettier, and `git diff --check` passed.

## Next step

Obtain explicit authorization for UAT project `idwbhwfyfvyaqsefvlnc` and the current authenticated
Supabase CLI session, then deploy `20261031220000_correction_requests.sql` and smoke-test the three
collector request types before closing CR-6.
