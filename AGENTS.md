# CobranzaPro

## Project Purpose

CobranzaPro is a web application for managing customers, loans, installments, payments, balances, late payments and collector portfolios.

The application handles financial data, so security, auditability and data consistency are mandatory.

## Stack

- Angular 22
- TypeScript 6
- PrimeNG 22 with Aura
- Tailwind CSS 4
- Supabase for Auth, PostgreSQL, RLS and RPC
- Vitest for unit and business-logic tests
- Playwright for E2E tests
- pnpm exclusively

Do not use npm or yarn for project workflows.

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

## Financial Integrity

- Financial operations must be transactional.
- Payments and financial records must remain auditable.
- Do not physically delete payment history or other critical financial history.
- Corrections should preserve who changed the record, when it changed and why.
- Do not implement definitive loan, interest, installment, late-payment or blacklist rules until those business rules are confirmed.

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
