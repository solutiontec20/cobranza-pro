# CobranzaPro

## Project Purpose

CobranzaPro is a web application for managing customers, loans, installments, payments, balances, late payments and collector portfolios.

The application handles financial data, so security, auditability and data consistency are mandatory.

## Stack

- Angular 22 (standalone-by-default, zoneless-friendly signal APIs)
- TypeScript ~6
- PrimeNG 22 with Aura theme (`@primeuix/themes`)
- Tailwind CSS 4 (via `tailwindcss-primeui`, `@tailwindcss/postcss`)
- Supabase for Auth, PostgreSQL, RLS, RPC and Edge Functions (Deno)
- `@ngx-env/builder` for `.env`-based Angular build/serve/test (variables must be prefixed `NG_APP_`)
- Vitest for unit and business-logic tests (run through `ng test`, not a standalone `vitest` binary)
- Playwright for E2E tests
- Cloudflare Workers (`wrangler`) as an alternate preview/deploy target alongside Netlify
- pnpm exclusively (`packageManager: pnpm@11.28.5`)

Do not use npm or yarn for project workflows.

## Essential Commands

```bash
pnpm install                 # install deps
pnpm start                   # ng serve (dev server)
pnpm build                   # ng build (production config by default)
pnpm watch                   # ng build --watch --configuration development
pnpm test                    # ng test (Vitest via @ngx-env/builder, watch mode)
pnpm test:ci                 # ng test --no-watch --no-progress (use this for one-shot/CI runs)
pnpm e2e                     # playwright test
pnpm e2e:ui                  # playwright test --ui
pnpm e2e:headed              # playwright test --headed
pnpm e2e:report              # playwright show-report
pnpm db:types                # regenerate src/app/core/supabase/database.types.ts from the local Supabase schema
pnpm supabase db start       # start local Supabase stack
pnpm supabase db lint --local --level error
pnpm supabase test db        # run supabase/tests/*.sql (pgTAP-style) against the local DB
pnpm preview:cf / pnpm deploy # build + wrangler dev/deploy (Cloudflare)
```

Running a single Vitest spec/suite: use `ng test` filtering flags (e.g. `pnpm test -- --project=<name>` is not wired up here — prefer running the full `pnpm test:ci` or narrowing with Vitest's `-t "pattern"` through `pnpm test -- -t "pattern"`); when in doubt, just run `pnpm test:ci` since the suite is small.

Required env vars (see `.env.template`, consumed via `import.meta.env` thanks to `@ngx-env/builder`, typed in `src/env.d.ts`):

```
NG_APP_SUPABASE_URL=
NG_APP_SUPABASE_PUBLISHABLE_KEY=
NG_APP_PRIMENG_UI_KEY=
```

`src/app/core/config/app-env.ts` throws at startup if any of these are missing — never read `import.meta.env` directly elsewhere, go through `appEnv`.

## Angular

- Use modern Angular APIs and standalone components.
- Do not add `standalone: true`; it is unnecessary in Angular 22.
- Do not explicitly set `ChangeDetectionStrategy.OnPush`; it is the default behavior in Angular 22.
- Prefer Signals for application and component state.
- Use `computed()` for derived state.
- Use `input()` and `output()` instead of decorator-based inputs/outputs.
- Use `inject()` instead of constructor injection.
- Use native template control flow: `@if`, `@for`, `@switch`.
- Do not use `ngClass`; prefer class bindings.
- Do not use `ngStyle`; prefer style bindings.
- Prefer Signal Forms for new forms when appropriate.
- Otherwise prefer Reactive Forms over template-driven forms.
- Keep feature routes lazy-loaded.
- Keep components small and focused.
- Prefer inline templates for small components.
- When using external templates/styles, use paths relative to the component TypeScript file.
- Use `NgOptimizedImage` for static images when applicable.

## TypeScript

- Keep strict type checking enabled.
- Prefer type inference when the type is obvious.
- Avoid `any`.
- Use `unknown` when the type is uncertain.
- Keep state transformations pure and predictable.
- Do not mutate signals directly; use `set()` or `update()`.
- `tsconfig.json` additionally enables `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `strictInjectionParameters`, `strictInputAccessModifiers` — write code that satisfies these (e.g. use `override` on overridden members, as in `AppError`'s `override readonly cause`).
- Prettier (`.prettierrc`): single quotes, 100-char print width, Angular parser for `*.html`. Run via your editor/IDE; there is no separate `pnpm format` script.
- Components registered with `loadComponent` are `export default class ...` (e.g. `export default class Clients`) so the route can `import('./clients/clients')` without a `.then(m => m.X)`. Follow this for new routed components.
- File naming mirrors Angular conventions seen throughout: `<name>.ts` for components/services (no `.component.ts`/`.service.ts` suffix), `<name>.store.ts` for stores, `<name>.store.spec.ts` for store tests, `<name>.model.ts` for model files, `<name>.repository.ts` for repository interfaces, `supabase-<name>.repository.ts` for adapters, `<name>.html` for external templates sitting next to their `.ts`.

## Accessibility

- UI must meet WCAG AA minimum requirements.
- Maintain keyboard accessibility and visible focus states.
- Use appropriate ARIA attributes where needed.
- Prefer semantic HTML.
- New UI should be compatible with automated accessibility checks such as AXE.

## UI and Styling

- PrimeNG Aura is the main visual theme.
- Use PrimeNG components before creating equivalent custom UI components.
- Tailwind CSS 4 is primarily for layout, spacing and responsive behavior.
- Do not create a `tailwind.config.ts` unless a concrete requirement justifies it.
- Prefer semantic PrimeNG/Tailwind tokens such as surface, primary and text tokens instead of hard-coded colors.
- UI language is Spanish.
- Locale is `es-PE`.
- Design mobile-first.
- Dark mode is enabled through the shared application dark-mode selector.

## Application Architecture

- SPA / CSR only.
- Do not introduce SSR.
- Do not introduce Astro for the application.
- Do not introduce a global state library unless a concrete problem requires it.
- Prefer Angular Signals, computed values and focused services first.
- Do not introduce libraries without a concrete requirement.
- Keep the architecture simple while preserving security, integrity and maintainability.

## Repository Structure

```
src/app/
  core/
    adapters/        Supabase implementations of the repository interfaces (SupabaseXRepository) + InMemoryDailyControlRepository (fixture-backed, see below)
    repositories/     Repository interfaces + InjectionToken per feature (XRepository, X_REPOSITORY)
    models/           Plain TS interfaces/types per domain (client, collector, loan, installment, payment, profile, daily-control)
    calculations/     Pure, DI-free business calculations shared across modules (loan-payment-calculations.ts)
    supabase/         Supabase client factory (SUPABASE token) + generated database.types.ts
    errors/           AppError + GlobalErrorHandler
    services/         Cross-cutting app-wide services (AppStoreService, layout, theme, toast)
    config/           app-env.ts (typed, validated env access)
  modules/
    admin/            Admin-only feature screens (clients, loans, collectors, dashboard, audit, daily-control)
    collector/         Collector-only feature screens (dashboard, clients, client-detail)
    auth/              Login, change-pin, auth.guard.ts, auth.routes.ts, auth.service.ts
  shell/              App shell, sidebar, topbar (post-login layout)
  shared/             Reusable UI pieces (shared/ui/<name>/<name>.ts), pipes, validators
supabase/
  migrations/         Timestamped SQL migrations (authoritative schema source)
  functions/          Deno Edge Functions (admin-create-collector, change-pin, admin-reset-collector-pin, _shared/)
  tests/              SQL tests run by `pnpm supabase test db` (RLS, RPCs, constraints)
  seed.sql
scripts/              One-off Node scripts (e.g. seed-dev-users.mjs) using the Supabase service/secret key — never ship this key to the frontend
e2e/                  Playwright specs, grouped by journey (e.g. e2e/auth/login.spec.ts)
odd/tasks/            Organic Driven Development task docs (objective/scope/constraints/checklist per feature slice, e.g. loan-admin-payments-and-schedule.md) — historical/planned implementation records for already-delivered or in-flight features; read the relevant one before touching loans/payments/schedule to see what was already decided and verified, but it is bookkeeping, not app source.
REQUERIMIENTO.md     Spanish business-requirements document from the client — the authoritative source for business rules (see "Confirmed business rules" below). Treat it like a migration or model file: read it before assuming or changing loan/payment/blacklist/cash-closure behavior.
MIGRATION.md         Historical plan for migrating the original static MVP (`mvp/`) to this Angular app — useful background, not a live task list.
```

### Repository + Adapter + Store pattern (follow this for every new feature)

This is the dominant pattern in `core/` and `modules/admin/*`; match it exactly for new features.

1. **Model** (`core/models/<feature>.model.ts`): plain interfaces in camelCase, independent from DB column names (e.g. `ClientListItem`, `CreateClientInput`).
2. **Repository interface** (`core/repositories/<feature>.repository.ts`): an interface plus an `InjectionToken`, e.g.:
   ```ts
   export interface ClientRepository { list(): Promise<ClientListItem[]>; create(input: CreateClientInput): Promise<Client>; }
   export const CLIENT_REPOSITORY = new InjectionToken<ClientRepository>('CLIENT_REPOSITORY');
   ```
3. **Supabase adapter** (`core/adapters/supabase-<feature>.repository.ts`): implements the interface, injects `SUPABASE` (typed `SupabaseClient<Database>`), maps `snake_case` DB rows to camelCase models by hand, and translates Supabase/Postgres errors into `AppError` (see below). Decorated with `@Service({ autoProvided: false })` — **not** `@Injectable`, and never `providedIn: 'root'`, because it must be provided per-route alongside its token.
4. **Store** (`modules/<area>/<feature>/<feature>.store.ts`): a plain class decorated with `@Injectable()` (no `providedIn`), injects the repository token via `inject()`, exposes `signal`s for data/`loading`/`saving`/`error`, and wraps repository calls in try/catch that sets `error` via `AppError.from(error).message`. Methods return `boolean` success flags for mutations where the UI needs to know whether to close a dialog/reset a form.
5. **Wiring**: both the Store and the `{ provide: X_REPOSITORY, useClass: SupabaseXRepository }` pair are provided in the **route's `providers` array** (see `modules/admin/admin.routes.ts`), not in `app.config.ts`. `app.config.ts` only provides the small number of app-wide singletons (currently just `AUTH_REPOSITORY`). Follow this per-route provisioning for new features so each lazy chunk only pulls in what it needs and stores don't leak singleton state across routes.
6. **Tests**: `*.store.spec.ts` next to the store, using `TestBed` with a hand-mocked repository object (`{ provide: X_REPOSITORY, useValue: repository }`, methods as `vi.fn<Repo['method']>()`). Pure calculation helpers (e.g. `loan-calculations.ts`) are tested directly without TestBed.

### `@Service` vs `@Injectable`

Both exist in this codebase and are **not interchangeable by convention here**:

- `@Service(...)` (Angular's newer decorator) is used for two different cases: (a) **all** Supabase adapters, including `SupabaseAuthRepository`, use `@Service({ autoProvided: false })` because they must be wired to their repository token explicitly (adapters in route `providers`, `SupabaseAuthRepository` explicitly in `app.config.ts` via `{ provide: AUTH_REPOSITORY, useClass: SupabaseAuthRepository }`); (b) app-wide root singletons (`AuthService`, `AppStoreService`, `layout.service.ts`, `theme.service.ts`, `toast.service.ts`) use plain `@Service()`, which is root-provided by default.
- `@Injectable()` (no `providedIn`) is used for per-route feature stores (`ClientsStore`, `CollectorsStore`, `LoansStore`) that are provided in route `providers` arrays, not globally.
- `CollectionDashboardStore` (`modules/collector/collection-dashboard.store.ts`) is a legacy exception using `@Injectable({ providedIn: 'root' })` — don't copy it for new code, it predates the current store pattern (see Legacy code below).

New singleton/root services: use `@Service()`. New per-route feature stores: use `@Injectable()` + route-level providers, matching `admin.routes.ts`.

### Error handling (`AppError`)

`core/errors/app-error.ts` defines `AppError extends Error` with a closed `AppErrorCode` union (`AUTH_INVALID_CREDENTIALS`, `AUTH_SESSION_EXPIRED`, `AUTH_UNAUTHORIZED`, `SUPABASE_CONNECTION`, `SUPABASE_RLS`, `SUPABASE_RPC`, `VALIDATION`, `NETWORK`, `UNKNOWN`) and a `cause`. Adapters translate raw Postgres/Supabase errors (by `error.code`, e.g. `23505` unique violation, `23503` FK violation, `23514` check violation, `42501` permission denied, or by substring-matching the RPC's `RAISE EXCEPTION` message) into `AppError` with a **Spanish, user-facing message**. Stores never show raw Supabase errors to the UI — they always go through `AppError.from(error).message`. Follow this translation pattern (code-first, then message substring) for any new adapter.

### Authentication mechanics

- UX is DNI + 6-digit PIN, but under the hood it is Supabase Auth email/password: `email = \`${dni}@auth.cobranzapro.local\`` and `password = <pin>`. Don't be confused by "password" fields in Supabase Auth — the PIN is the password.
- `AuthService` (`modules/auth/auth.service.ts`) wraps `AUTH_REPOSITORY` (`SupabaseAuthRepository`, provided app-wide in `app.config.ts`), persists the current `Profile` to `localStorage` under `cobranzapro_user`, and exposes `isAuthenticated`, `isAdmin`, `isSupervisor`, `isCollector`, `mustChangePin` as `computed()` signals.
- Route guards (`modules/auth/auth.guard.ts`): `authGuard` (must be logged in), `operationalGuard` (logged in **and** not forced to change PIN — used on all admin/collector feature routes), `publicGuard` (redirects an already-logged-in user away from `/login`, respecting `mustChangePin`).
- PIN changes and admin-driven collector/PIN management go through Supabase Edge Functions (`supabase/functions/change-pin`, `admin-create-collector`, `admin-reset-collector-pin`), not direct table writes, because they need `auth.updateUser` / service-role operations the frontend must never perform directly. Shared PIN validation (`isSixDigitPin`, `isWeakPin`) lives in `supabase/functions/_shared/pin.ts`.
- `scripts/seed-dev-users.mjs` seeds local/dev auth users using `SUPABASE_SECRET_KEY` from `process.env` (not `NG_APP_*`) — it is a Node script run outside the Angular app and must never be imported into frontend code.

### Legacy code — do not extend

- `src/app/core/models/legacy-loan.model.ts` (`LegacyLoan`) and the rest of the `FrequencyType`/mock-driven model shapes in `profile.model.ts` are an explicit **temporary MVP contract** still used by `AppStoreService` and `modules/collector/*` (`collection-dashboard.store.ts`, `clients.ts`, `dashboard.ts`, `client-detail.ts`). The file's own docstring says: "New Supabase-backed features must use `loan.model.ts` instead."
- The collector module is still running on `AppStoreService`'s in-memory/mock data (`loans()`, `clients()`, `getClientRiskStatus()`, etc.), **not** the Supabase repository/adapter/store pattern used under `modules/admin/*`. When asked to migrate collector screens to Supabase, follow the admin pattern (repository + adapter + per-route store), don't extend the mock `AppStoreService`.
- `mvp/` at the repo root contains a static HTML prototype (`cobranzapro_app.html`, `index.html`) — reference only, not part of the Angular build.
- `modules/admin/audit/audit.ts` is a placeholder stub (`<p>En construcción</p>`) — the audit screen described in `MIGRATION.md`/`REQUERIMIENTO.md` is not implemented yet.

### Daily Control module — fixture-backed, not Supabase yet

`modules/admin/daily-control/*` (route `control-diario`) follows the repository/adapter/store pattern structurally, but `admin.routes.ts` wires `DAILY_CONTROL_REPOSITORY` to `InMemoryDailyControlRepository` (`core/adapters/in-memory-daily-control.repository.ts`), not a `Supabase*Repository`. That adapter keeps hardcoded fixture loans/payments/closures in module-level arrays and an in-memory `Map` for cash-closure state (reset on reload). Treat `DailyControlReport`/`DailyCashClosure` shapes in `daily-control.model.ts` as the target contract, but don't assume the data is real or persisted — if asked to make this feature production-ready, replace the in-memory adapter with a Supabase one following the same interface, the same way `clients`/`loans`/`collectors` already do.

### Shared UI components (`shared/ui/<name>/<name>.ts`)

Small reusable presentational pieces (e.g. `CollectionMetric`, `CollectionClientCard`) live under `shared/ui/<kebab-name>/<kebab-name>.ts`, one component per folder, **not** `export default` (unlike routed page components). They use `input()` for all props (including `input.required<T>()` and `input('default')` for optional ones with a default), put static classes via the `host: { class: '...' }` object instead of a wrapper `@HostBinding`, and favor an inline template with Tailwind utility/PrimeNG surface tokens. Follow this shape for new small shared widgets instead of inventing a different folder layout.

### Export patterns (`daily-control-export.service.ts`)

Per-route export services (provided alongside the feature's store, e.g. `DailyControlExportService` in `admin.routes.ts`) implement CSV generation with a plain string-building helper, and XLSX/PDF via **dynamic `import('exceljs')` / jsPDF** (`jspdf` + `jspdf-autotable`) inside the method that needs them, so those heavy libraries stay out of the eagerly-loaded bundle. Follow this dynamic-import approach for any new Excel/PDF export rather than a static top-level import.

### Signal Forms in practice

`modules/admin/loans/loan-detail.ts` is the concrete reference for Signal Forms usage: imports `form`, `FormField`, `max`, `maxLength`, `min`, `required`, `submit`, `validate` from `@angular/forms/signals`, builds a plain TS model interface (e.g. `LoanEditModel`) and a `form(signal(model), schema)` call, and binds fields with `[field]="theForm.prop"` + `<app-FormField>`-style wiring. Read this file before writing a new Signal Form instead of guessing the API shape.

### Audited edit reasons (`loan-edit-reasons.ts`)

Admin/supervisor-only loan edits use a small predefined-reason-code pattern: a `LoanEditReasonCode` union (`'amount_error' | 'rate_error' | 'installment_count_error' | 'other'`), a `LOAN_EDIT_REASON_OPTIONS` array of `{ label, value }` for the UI `p-select`, and a pure `resolveLoanEditReason(code, customReason)` helper that returns the label for predefined codes or the trimmed custom text for `'other'` (empty/whitespace-only custom reason resolves to `null`, which the caller must treat as invalid). Reuse this pattern for any other feature that needs an auditable "reason for change" input instead of a free-text-only field.

## Supabase and Database

- All schema changes must be versioned as Supabase migrations.
- Do not use manual production schema changes as the normal development workflow.
- Test migrations in UAT before applying them to production.
- Never expose `service_role`, secret keys, database passwords or privileged credentials in frontend code.
- Frontend may use the Supabase publishable key with correct RLS policies.
- RLS is mandatory for access-control boundaries.
- Collector A must never be able to access Collector B's portfolio.
- Production Supabase MCP access must remain read-only.
- Prefer PostgreSQL/RPC transactions for critical financial operations.

### Concrete conventions observed in `supabase/`

- Migration files live in `supabase/migrations/`, named `<UTC timestamp>_<snake_case_description>.sql` (e.g. `20261020165847_secure_collector_pin_management.sql`). Create new migrations the same way (via `pnpm supabase migration new <name>` or an equivalent timestamped file) — never edit an already-applied migration.
- Core tables so far: `profiles` (role: `admin`/`collector`/`supervisor`, `dni`, `active`), `customers` (`document_number`, `collector_id` FK to `profiles`, `active`), `loans` (`principal_amount`, `interest_rate_percent`, `total_amount`, `installment_count`, `frequency`, `started_on`, `first_due_on`, `status`), plus derived views/tables `installment_balances` and `customer_financial_status` used for balances/overdue aggregation. Always check `src/app/core/supabase/database.types.ts` (regenerate with `pnpm db:types`) before assuming a column name/type.
- Financial writes (creating/updating a loan, registering a payment, listing collectors, changing a collector's PIN, admin collector management) go through **Postgres RPC functions** called via `supabase.rpc('fn_name', { p_arg: ... })`, e.g. `admin_create_loan`, `admin_update_loan`, `register_payment`, `admin_list_collectors`, `service_complete_collector_pin_change`. RPC parameter names are snake_case and prefixed `p_`. Business-rule violations are surfaced as Postgres `RAISE EXCEPTION` text that adapters match by substring (see Error handling above) — read the migration that defines the RPC before assuming what message/condition it raises. `register_payment` authorizes admins/supervisors to pay on behalf of any customer while still recording the customer's actually-assigned collector on the payment/ledger rows — don't assume the caller's id is the collector id for that RPC.
- Admin-privileged operations that Postgres RLS alone can't gate safely (creating a collector's auth user, resetting a PIN, changing a PIN) are implemented as **Supabase Edge Functions** under `supabase/functions/<name>/index.ts` (Deno), using `withSupabase({ auth: 'user' }, ...)` from `@supabase/server` to get a user-scoped `ctx.supabase` and a privileged `ctx.supabaseAdmin`. Shared helpers go in `supabase/functions/_shared/`.
- SQL tests (pgTAP-style) live in `supabase/tests/*_test.sql`, one file per concern (`rls_customers_test.sql`, `financial_rpcs_test.sql`, `admin_loan_management_test.sql`, `admin_collector_management_test.sql`, `daily_schedule_repair_test.sql`, `payment_allocation_reconciliation_test.sql`, `schema_test.sql`). Run them locally with `pnpm supabase db start` then `pnpm supabase test db` (this is exactly what CI's `database` job does).
- The daily/schedule-related migrations have been iterated several times in place via **new, additive migrations** rather than edits (`update_loan_schedule` → `daily_schedule_monday_saturday` → `fix_payment_active_schedule_allocation` → `repair_active_daily_schedules` → `reconcile_incomplete_payment_allocations` → `reassert_new_daily_schedule_monday_saturday`). This is the expected way to correct a previously-shipped schedule/allocation bug here: ship a new migration that repairs existing rows and reasserts the function definition, never rewrite an already-applied migration file.
- `pnpm supabase db lint --local --level error` is run in CI before the SQL tests — run it locally too after changing the schema.

## Financial Integrity

- Financial operations must be transactional.
- Payments and financial records must remain auditable.
- Do not physically delete payment history or other critical financial history.
- Corrections should preserve who changed the record, when it changed and why.
- Business rules not covered by `REQUERIMIENTO.md` or existing code (e.g. new late-payment penalties, new interest schemes) must still not be invented — confirm with the user.

### Confirmed business rules (`REQUERIMIENTO.md`)

The client-provided `REQUERIMIENTO.md` (Spanish) is now the authoritative source for the rules below. Some are already implemented in code (noted inline); others are specified but not yet built — check the relevant model/store/migration before assuming a rule is live.

- **Roles**: `admin` (full access, creates users), `supervisor` (sees/corrects all portfolios, cannot create users or reassign a client's collector), `collector` (only own clients; cannot correct/void payments or edit an existing loan). Matches `Profile.role` and the RLS/RPC authorization already in migrations.
- **Loan total**: `total = principal + principal * rate / 100`, interest charged **once** (simple, not compounding); default rate is 20% if unspecified but is editable per loan (10/20/30/%...). Implemented in `loan-calculations.ts` (`calculateLoanSummary`) and mirrored in the `admin_create_loan` / `admin_update_loan` RPCs.
- **Installment amount**: `total / installmentCount`, rounded to cents; the **last installment absorbs the rounding remainder** so the schedule always sums exactly to `total`. Implemented in `calculateLoanSummary` (`lastInstallmentAmount`) and the schedule-generation RPCs.
- **Collection calendar** (`firstDueOn` + schedule-generation RPCs):
  - **Daily**: Monday–Saturday, **Sunday is skipped**; holidays are collected normally. Implemented (migration `20261021010000_daily_schedule_monday_saturday.sql` and later repair migrations extend/reassert this to Mon–Sat).
  - **Weekly**: same weekday every week.
  - **Monthly**: same day-of-month; if that day is a Sunday, roll to Monday, *unless* that Monday falls in the next month, in which case roll back to the preceding Saturday instead.
- **Payment application**: tracks "should have been paid as of today" vs. "actually paid"; partial payments carry the shortfall forward to the next due date; advance payments cover multiple future installments at once; oldest-unpaid-first allocation (see `payment-balance-and-allocation.md` and `allocateOldestFirst`-style logic).
- **Blacklist**: a client automatically enters a blacklist state after **more than 5 days** of accumulated overdue, and automatically exits once caught up — no manual toggle. No separate interest/penalty is charged for being overdue. A blacklisted client cannot renew their loan. **Not yet confirmed as implemented in the current schema/RPCs — check `database.types.ts`/migrations before assuming a `blacklist`/`is_blacklisted` column or RPC exists.**
- **Loans/renewals**: one active loan per client at a time; a renewal closes the previous loan and creates a new one linked to it, carrying over any outstanding balance into the new loan's principal. New loans can be created by admin, supervisor and collector; only admin/supervisor can edit an existing loan afterwards (matches `admin.routes.ts` wiring and `loan-edit-reasons.ts` being admin/supervisor-only UI).
- **Corrections/audit**: a posted payment is never deleted — only voided/corrected, preserving who/when/before/after/why. A client's assigned collector cannot be changed except via an explicit bulk portfolio-reassignment action (collector leaving the company).
- **Daily cash closure**: per collector, per day — system shows expected vs. registered, collector reports delivered cash/Yape, supervisor/admin validates, differences are recorded with an observation; outflows (new loan disbursements, refunds) are also tracked as cash movements, not just inflows. Modeled by `DailyCashClosure`/`DailyCashMovement` in `daily-control.model.ts`, but the current `control-diario` route is wired to `InMemoryDailyControlRepository` (fixture data), **not** a Supabase-backed implementation yet — see the Daily Control gotcha below.
- **Reports/exports**: Excel, PDF and TXT formats; admin/supervisor can export every report, collectors can only export their own payment history/schedule. `DailyControlExportService` already implements `csv`/`xlsx`/`pdf` (via dynamic `import('exceljs')` / `jspdf`+`jspdf-autotable`) for the daily-control report — follow that pattern (dynamic import, keep the heavy export libs out of the main bundle) for new export features; no TXT exporter exists yet.
- **Timezone**: all dates/times are Peru time (`es-PE`, America/Lima); the business day closes on that clock.
- **Auth lockout**: repeated failed PIN attempts should lock the account; the admin can issue a new PIN. Cross-check `supabase/functions/admin-reset-collector-pin` and any rate-limiting before assuming this is fully enforced server-side.

## Authentication

- The requested user experience is DNI + PIN.
- Do not implement an insecure custom authentication shortcut.
- PINs must never be stored as plain text.
- Authentication design must include appropriate rate limiting / lockout considerations.

## Testing

### Unit / Business Logic

Use Vitest for:

- interest and amount calculations
- installment calculations
- schedule generation
- partial payments
- advance payments
- balances
- rounding
- late-payment rules
- state transitions

Do not chase 100% coverage as a metric.

Concrete pattern observed: `*.store.spec.ts` files sit next to the store they test (e.g. `src/app/modules/admin/loans/loans.store.spec.ts`) and mock the repository via `TestBed.configureTestingModule({ providers: [Store, { provide: X_REPOSITORY, useValue: repository }] })`, with `repository` built as plain objects of `vi.fn<Repo['method']>()`. Pure helper modules like `loan-calculations.ts` (`calculateLoanSummary`, `firstDueOn`, `roundMoney`) are tested directly with `describe`/`it`/`expect` and no Angular TestBed — prefer extracting pure calculation functions like this for anything involving money/dates so they can be unit-tested without DI. Vitest runs through `ng test` (the `@ngx-env/builder:unit-test` builder), not a bare `vitest` CLI; `tsconfig.spec.json` only includes `src/**/*.spec.ts`.

### Database / Security

Use Supabase/PostgreSQL tests for:

- RLS
- RPC functions
- constraints
- role permissions
- denied-access scenarios

Mandatory security case:

```text
Collector A must not be able to access Collector B's customers or financial data.
```

### E2E

Use Playwright only for critical journeys, such as:

- administrator login
- collector login
- administrator creates collector
- administrator creates customer
- administrator creates loan
- collector sees only assigned portfolio
- collector cannot access another collector's customer
- collector registers payment
- payment updates balance/installments correctly
- administrator sees consolidated information

Do not create E2E tests for purely cosmetic behavior.

Current state: only `e2e/auth/login.spec.ts` exists today (asserts `/login` loads). The full list of critical journeys above is the target coverage, not what's already implemented — don't assume broader E2E coverage exists without checking `e2e/`.

## CI (`.github/workflows/ci.yml`, `audit-security.yml`, `deploy-production.yml`)

- CI triggers on PRs targeting `main` or `dev`.
- `checks` job: `pnpm audit --audit-level=high` → `pnpm test:ci` → `pnpm build` → install Playwright Chromium → `pnpm e2e`. Requires `NG_APP_PRIMENG_UI_KEY`, `NG_APP_SUPABASE_URL`, `NG_APP_SUPABASE_PUBLISHABLE_KEY` as env/secrets.
- `database` job: `pnpm supabase db start` → `pnpm supabase db lint --local --level error` → `pnpm supabase test db`. Runs independently of the Angular checks job.
- Mirror these steps locally before pushing a PR: `pnpm test:ci && pnpm build && pnpm e2e`, and if you touched `supabase/`, also `pnpm supabase db lint --local --level error && pnpm supabase test db`.

## Environments

### UAT

- Uses Supabase UAT.
- Contains fake/test data.
- May be used by Playwright and manual QA/UAT.
- May be reset when needed.

### Production

- Uses Supabase PROD.
- Contains real data.
- Must not be used for destructive automated tests.
- MCP access must remain read-only.

## Git and Deployment

- `main` represents production-ready code.
- Prefer feature branches and pull requests.
- Validate changes before merging to `main`.
- Netlify Deploy Previews are for review/UAT.
- Netlify production deploys come from `main`.

## Package Manager

Use pnpm exclusively.

Preferred commands:

```bash
pnpm install
pnpm start
pnpm build
pnpm test
pnpm e2e
pnpm supabase ...
```

## Decision Rule

When choosing between a more sophisticated solution and a simpler one, choose the simplest option that preserves:

1. security
2. financial integrity
3. auditability
4. maintainability
5. future growth without unnecessary rewrites
