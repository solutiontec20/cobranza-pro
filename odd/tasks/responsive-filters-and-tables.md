# Responsive filters and tables

## Objective

Make every implemented data-heavy admin, supervisor, and collector view easy to search and scan,
especially on mobile and with long schedules or histories, while keeping the existing visual
language and financial workflows intact.

## Problem

Filtering and pagination are inconsistent across modules. Some desktop tables already paginate,
while their mobile card equivalents still render every record. Loan schedules and payment histories
can grow to 90 or more rows, forcing excessive scrolling. The admin cash-closure screen also allows
direct expense registration even though expenses must originate as collector requests.

## Authorized scope

- Add context-appropriate filters to implemented data-heavy routed views.
- Add client-side pagination where data is already loaded locally and preserve existing server-side
  pagination where present.
- Give schedules and payment histories consistent mobile cards, desktop tables, status filters, and
  shared paging behavior.
- Remove only the direct `Registrar gasto` action from admin/supervisor cash closure.
- Preserve `Registrar apertura`, `Registrar viático`, expense approval/rejection, and closure
  validation.
- Keep Auditoría and the unimplemented collector Perfil route out of scope.

## Constraints

- Mobile-first, WCAG AA, keyboard accessible, visible focus, and touch-friendly controls.
- Use PrimeNG and existing semantic Tailwind/PrimeNG tokens.
- Avoid backend/schema changes unless current repository contracts make a correct filter impossible.
- Never hide or delete financial history; filters only change presentation.
- Keep filter and pagination counts honest across mobile and desktop.
- Use pnpm exclusively.
- Do not create commits, following the user's standing instruction.
- Do not perform remote operations.

## Delivery

- Strategy: ask-on-risk; no commit/PR slicing applies because commits are explicitly disallowed.
- Forecast: approximately 900 authored changed lines across routed components, templates, shared
  pagination utilities, and tests.
- RDD: disabled/unmanaged.

## Testing mode

- TDD: off; no explicit project/session TDD setting exists.
- Unit runner: `pnpm test:ci` (direct local Angular binary if the pnpm shim remains unavailable).
- Build runner: `pnpm build` (direct local Angular binary if needed).

## Tasks

- [x] **RFT-1 — Standardize long schedules and payment histories**
  - Add status/method filters and bounded pagination to admin and collector loan details.
  - Keep mobile cards and desktop tables on the same filtered page.
  - Show visible/total counts and useful empty-filter states.

- [x] **RFT-2 — Improve administrative collection views**
  - Review dashboard performance, clients, loans, collectors, daily control, cash closure, and
    correction requests.
  - Add only useful missing filters and pagination without duplicating existing controls.

- [x] **RFT-3 — Improve collector collection views**
  - Paginate the daily route and client portfolio.
  - Add useful portfolio filters and expense-status filtering while preserving fast mobile use.

- [x] **RFT-4 — Restrict admin cash-closure expense entry**
  - Remove the admin/supervisor `Registrar gasto` action and its unused dialog path.
  - Preserve collector expense requests and admin/supervisor approval or rejection.

- [x] **RFT-5 — Verify responsive behavior**
  - Run formatting, TypeScript, unit tests, and Angular build.
  - Review representative mobile and desktop states for long datasets and record skipped checks.

## Progress

- Verified admin clients and daily control already use pagination; loans paginate only the desktop
  table, while mobile cards remain unbounded.
- Verified admin and collector loan details render complete schedules and histories without paging.
- Verified collector dashboard and portfolio lists are filtered but unbounded.
- Verified admin cash closure currently exposes `Registrar apertura`, `Registrar viático`, and
  `Registrar gasto`; only `Registrar gasto` is to be removed.
- RFT-1 completed: admin and collector loan details now share status/method filters, bounded page
  sizes, consistent mobile/desktop pages, visible counts, and filtered empty states.
- RFT-4 completed: the admin/supervisor direct expense button, dialog, and component state were
  removed; opening, viaticum, collector expense review, and closure validation remain available.
- RFT-2 completed: administrative loans now share one page across cards/table; collectors add status
  filtering and paging; correction requests add search/type filters and paging; dashboard collector
  performance adds search/delay filters and paging. Existing client and daily-control filters were
  preserved rather than duplicated.
- RFT-3 completed: the collector daily route and client portfolio are paginated; portfolio search,
  loan-state/risk filters, and sorting remain touch-friendly; cash-closure expenses add status
  filtering and bounded paging.
- Actual working-tree change volume is approximately 4,589 authored added/deleted lines across the
  responsive templates and component state. No commit or PR slice was created because the user
  explicitly prohibited commits.

## Verification evidence

- RFT-1: `tsc -p tsconfig.app.json --noEmit` passed.
- RFT-1: focused Angular/Vitest run passed (1 file, 3 tests).
- RFT-1: Angular development build passed after rerunning outside the restrictive filesystem
  sandbox; the first sandboxed build could not resolve project paths.
- RFT-4: TypeScript application compilation passed; a source search confirmed direct expense entry
  is gone while opening, viaticum, approval, and rejection controls remain.
- RFT-2/RFT-3: `tsc -p tsconfig.app.json --noEmit` passed.
- RFT-5: full Angular/Vitest suite passed (25 files, 179 tests).
- RFT-5: production Angular build passed. Existing warnings remain: initial bundle is 840.60 kB
  against a 500 kB budget, plus known CommonJS optimization warnings from export dependencies.
- RFT-5: headless Chromium smoke checks passed on 390×844 mobile and 1440×900 desktop for admin
  loans, collectors, correction requests, cash closure, dashboard, collector daily route, client
  portfolio, collector cash closure, and admin loan schedule/payment history pagination.
- `agent-browser` was unavailable in this environment, so the installed Playwright/Chromium package
  was used for equivalent local UI checks.

## Next step

Feature implementation and verification are complete; await user review without committing.
