# Access control RBAC and configurable collector hours

Objective: implement the approved first version of configurable roles and permissions, preserving the existing operational roles and making collector operating hours configurable.  
Branch: `ray`. Delivery: user-managed commits; the agent must not stage, commit, push, or open a PR.  
Test runners: `pnpm supabase test db`, targeted `pnpm test:ci --include ...`, `pnpm build`, and focused Playwright only after the first Angular version is complete.

## Specs

### S1 — Implement the approved technical specification

User requirement (verbatim):

> ahora necesito que podamos avanzar con la implementacion de docs\technical\ROLES_Y_PERMISOS_ESPECIFICACION_TECNICA.md

Acceptance:

- Keep `admin`, `supervisor`, and `collector` as operational base roles.
- Apply configurable RBAC only to administrative users (`admin` and `supervisor`).
- Support one active access role per administrative user.
- Keep collectors outside dynamic RBAC.
- Reserve `roles.manage` for the system administrator.
- Force a new login after role, assignment, or permission changes.
- Make PostgreSQL/RPC authorization authoritative; Angular permissions are UX only.
- Preserve RLS, portfolio ownership, credential freshness, cash-day integrity, and financial rules.

### S2 — Make collector hours configurable

User requirement (verbatim):

> Mantienen el horario de 07:00 a 20:00, hora de Lima esto que sea coomfigurable y si haz lo que dijiste de la implementacion

Acceptance:

- Default schedule remains 07:00 inclusive to 20:00 exclusive in `America/Lima`.
- The schedule is stored and validated by PostgreSQL, not by Angular or JWT metadata.
- Only the system administrator can change the schedule in the first version.
- A reason is mandatory and every change is audited atomically.
- `private.collector_access_is_open`, `private.current_app_role`, and `current_access_status` use the same configuration.
- The trusted pgTAP clock override remains restricted to `session_user = 'postgres'`.
- Invalid or incomplete configuration fails closed.

Assumption approved for implementation: the first version supports one daily interval shared by all collectors, fixed to timezone `America/Lima`, with start strictly earlier than end. Per-day schedules, holidays, split shifts, and per-collector schedules are outside this version.

### S3 — Defer Angular unit tests until the first Angular version is complete

User requirement (verbatim):

> enfocaque en el desarollo las pruenas unitarias en angular hazlas al final o cuando me digas que ya terniaste la priera version recomendadas

Acceptance:

- Database behavior ships with focused pgTAP tests alongside each migration.
- Angular implementation may use build/type checks during development.
- Angular unit tests are written and executed together after the first complete Angular RBAC version.
- Full `test:ci`, build, database suite, and critical E2E checks run once at feature closure.

## Tasks

- [x] **T1** — S1-S3 — Reconcile the technical specification with approved decisions and configurable schedule. Route: inline documentation. Commit: user-managed. Evidence: specification status, scope, data model, RPCs, UX, migration, tests, acceptance criteria, exclusions, and approved decisions updated.
- [x] **T2** — S1 — Add the private RBAC catalog, system roles, assignments, audit, permission helpers, access context, administrative RPCs, session invalidation, and focused pgTAP coverage. Prove the model first against one low-risk read RPC. Route: delegated writer (context-backstop trigger). Commit: user-managed. Evidence: migration and 34-assertion pgTAP suite added; independent focused verification resolved supervisor overgrant and stale role-transition blockers. Runtime DB execution remains pending because local PostgreSQL is unavailable.
- [x] **T3** — S2 — Add configurable collector schedule, system-admin management RPCs, atomic audit, and pgTAP coverage while preserving fail-closed access. Route: delegated writer after T2 because schedule authorization reuses the RBAC system-admin helper. Commit: user-managed. Evidence: additive migration plus 33-assertion pgTAP suite; independent verification resolved schedule-state, JWT freshness, no-op invalidation, and inactive-collector coverage blockers. Runtime DB execution remains pending because local PostgreSQL is unavailable.
- [x] **T4** — S1 — Add Angular access-control models, repository/adapter, session service, permission guard, route metadata, and permission-filtered navigation. Route: delegated writer (context-backstop trigger). Commit: user-managed. Evidence: in-memory fail-closed context, permission guard, route metadata, filtered admin menu, lazy access-denied page, and matching database types; TypeScript and independent verification passed.
- [x] **T5** — S1-S2 — Add lazy `/admin/roles` UI for roles, assignments, and collector schedule using Signal Forms and real-change detection. Route: inline after T2-T4. Commit: user-managed. Evidence: screen completed and reviewed in a real browser (8 Playwright checks: dependency auto-selection, restricted permissions disabled, reason required, no-op saves disabled, read-only supervisor, limited role, no horizontal overflow at 360/768 px); build was broken by four `maxlength` attributes on `[formField]` inputs and a nested `<main>` landmark, both fixed.
- [x] **T6** — S1 — Migrate administrative module actions and backend RPCs incrementally to the permission catalog without weakening domain rules. Route: inline slices; high-risk financial operations isolated. Commit: user-managed. Evidence: `20261123190000_apply_access_permissions.sql` enforces the permission in 28 RPCs and on direct `customers` writes; `access_permissions_enforcement_test.sql` (32 assertions, mutation-checked); every admin screen hides actions by permission. Read-side RLS is NOT permission-gated (documented limitation, spec §19).
- [x] **T7** — S3 — Add deferred Angular unit tests, critical E2E coverage, regenerate database types, and run final database/functions/test/build checks. Route: delegated verification where required by security risk. Commit: user-managed. Evidence: specs for the access-control service, permission guard, adapter and store; E2E for the roles screen; all pgTAP files executed (see L11). `pnpm db:types` was not re-run (no Docker); the migrations add no public function or table, so the generated types are unchanged.

Forecast: substantially above 400 authored lines because the feature includes a PostgreSQL authorization model, migrations/tests, Angular session integration, a management screen, and incremental RPC protection. Delivery remains in user-controlled commits as explicitly established for this repository.

## Log

- **L1 — 2026-11-23:** User request verbatim: “ahora necesito que podamos avanzar con la implementacion de docs\technical\ROLES_Y_PERMISOS_ESPECIFICACION_TECNICA.md”.
- **L2 — 2026-11-23:** Blocking scope confirmation was accepted: admin/supervisor-only configurable RBAC, one role per user, collectors excluded, `roles.manage` system-admin-only, and forced new login after access changes.
- **L3 — 2026-11-23:** User correction verbatim: “Mantienen el horario de 07:00 a 20:00, hora de Lima esto que sea coomfigurable y si haz lo que dijiste de la implementacion enfocaque en el desarollo las pruenas unitarias en angular hazlas al final o cuando me digas que ya terniaste la priera version recomendadas”.
- **L4 — 2026-11-23:** Exploration confirmed the base `app_role` enum must remain unchanged; current access hours are hardcoded in two database paths; permission revocation must preserve `credentials_invalid_before` semantics; unrelated worktree change `.agents/mcp_config.json` must remain untouched.
- **L5 — 2026-11-23:** T1 completed. The technical specification now records the approved scope and the configurable shared collector schedule. T2 and T3 were changed from parallel to sequential because schedule administration depends on the RBAC system-administrator authority.
- **L6 — 2026-11-23:** T2 implementation completed in `20261123153531_access_control_rbac.sql` with `access_control_rbac_test.sql`. Independent verification found and rechecked fixes for supervisor permission overgrant and stale assignments/sessions after base-role changes. Static verification passed; pgTAP execution is deferred because `127.0.0.1:54322` is unavailable.
- **L7 — 2026-11-23:** T3 implementation completed in `20261123160420_configurable_collector_schedule.sql` with `collector_access_schedule_config_test.sql`. The default remains 07:00–20:00 `America/Lima`; updates are system-admin-only, audited, fail closed, and invalidate active collectors only. Independent verification rechecked all reported test blockers; runtime pgTAP remains pending because local PostgreSQL is unavailable.
- **L8 — 2026-11-23:** T4 Angular access context completed. Permissions remain in memory, route/menu UX fails closed, and existing authentication/base-role/collector-hour guards remain active. TypeScript and independent verification passed; Angular unit tests remain intentionally deferred.
- **L9 — 2026-11-23:** Reconciled the T2 read/mutation seam: role and assignment read RPCs require `roles.view`, while all mutations remain system-administrator-only through `roles.manage`. The pgTAP plan now contains 37 assertions; static independent verification passed.
- **L10 — 2026-11-23 (handover):** Codex stopped mid T5: the roles screen existed but the production build failed (four `maxlength` attributes on `[formField]` inputs, error NG8022). Fixed by removing them; the length limits already live in the form schema.
- **L11 — 2026-11-23 (database verification):** Docker was unavailable, so the whole migration chain and every pgTAP file were run against an in-memory PostgreSQL (PGlite) with a minimal pgTAP stand-in and Supabase stubs (throwaway, not committed). Result: all 29 files green. This surfaced defects that static review could not: (1) `admin_client_list_pagination_test` still expected the old collector denial message after the RBAC change; (2) `access_control_rbac_test` #26 asserted that the last system administrator could not be reassigned, which the RPC can never trigger (the actor must be a different system administrator, so at least two always exist) — replaced by the observable invariant that one active system administrator always remains; (3) `collector_access_schedule_config_test` read `private.access_control_audit_log` as `authenticated` and crashed — now reads it as the owner. The same run confirmed the earlier `service_record_login_attempt` NULL fix (login_lockout 17/17) and the analytics RPC tests (26/26). A mutation check (removing the `customers` trigger and the `void_payment` check) fails exactly the five matching assertions.
- **L12 — 2026-11-23 (design decisions):** the permission is inserted into each existing RPC by re-creating it from its current `pg_get_functiondef` instead of copying 28 bodies by hand, so the latest shipped logic is what gets protected. Admin-only RPCs use `require_admin_permission` (enforced only for base role admin) to keep the original denial messages supervisors already receive. `admin_assign_access_role` can give a custom role to an `admin` (not only a supervisor), so admin-only operations are permission-gated too.
- **L13 — 2026-11-23 (integration fixes):** the access-control adapter translated English messages that the SQL never raises (for example `Users cannot assign roles to themselves` vs `Self assignment is prohibited`); it now maps the real ones (`KNOWN_ACCESS_ERRORS`). `AccessControlService` reused any in-flight load, even one that belonged to a previous user; it now shares only the same user's request. The `/admin/sin-acceso` page offers the first section the user may open instead of only "Volver a seguridad".
- **L14 — 2026-11-23 (open follow-ups, not blockers):** RLS `SELECT` policies remain base-role only (spec §19, first unchecked item); `loans.create` is only effective for base role admin because `admin_create_loan` is admin-only; `pnpm supabase test db` and `pnpm db:types` should still be run once on a machine with Docker before merging to `main`, because that deploy applies migrations to production.
