# Clean DEV and Bootstrap Administrator

## Objective

Rebuild the authorized Cobranza Pro DEV Supabase project from repository migrations, leave it
without operational data, and bootstrap exactly one administrator.

## Problem and Why

DEV contains data that must be removed before the team starts validation. The repository seed is
local-only and would recreate fictional users and financial fixtures, so it must not run remotely.

After bootstrap, the administrator was correctly redirected to the mandatory PIN-change screen,
but the backend rejected every non-collector. The shared route and UI support all roles while both
the Edge Function and completion RPC were implemented as collector-only operations.

## Authorized Scope

- Remote target: Cobranza Pro Dev (`idwbhwfyfvyaqsefvlnc`).
- Authorized credential: the existing authenticated Supabase CLI session on this computer.
- Create administrator DNI `40326721`, full name `Edwin Enríquez Nizama`.
- Create a recoverable DEV backup before deletion.
- Production is explicitly out of scope.
- DEV-to-PRD data transfer is deferred until testing is accepted.

## Constraints

- Never run `supabase/seed.sql` against DEV.
- Never expose or commit privileged credentials or the temporary PIN.
- Preserve the migration-defined schema, RLS, RPCs, and audit behavior.
- Stop if the resolved remote target differs from the authorized project reference.
- Allow every active profile to change its own PIN; collector access hours remain collector-only.

## Delivery and Testing

- Delivery strategy: `ask-on-risk`.
- Chain strategy: `feature-branch-chain` selected by the user after the forecast exceeded the
  review budget.
- Planned slices:
  - Slice A: generic PostgreSQL PIN completion, generated types, and SQL regression coverage.
  - Slice B: role-aware Edge Function behavior and application verification.
  - Slice C: DEV migration/function deployment and live forced-PIN-change verification.
- Forecast authored change: approximately 300 total lines, excluding operational output.
- TDD: not configured; regression tests and runtime verification are required before deployment.
- Receipt-driven development: disabled (`clone_local`); ordinary verification applies.

## Tasks

- [x] **DEV-RESET-01 — Verify target and create recovery backup**
  - Confirm the CLI resolves only the authorized DEV project.
  - Export recovery artifacts before deletion and record their location.
  - Check: backup commands complete successfully and artifacts are non-empty.

- [x] **DEV-RESET-02 — Rebuild DEV without fixtures**
  - Reset the authorized remote database from repository migrations with seed disabled.
  - Check: migration history matches the repository and operational tables contain zero rows.

- [x] **DEV-RESET-03 — Bootstrap the sole administrator**
  - Create the Auth user safely and the matching `public.profiles` row.
  - Require replacement of the generated temporary PIN.
  - Check: exactly one Auth user and one active admin profile exist.

- [x] **DEV-RESET-04 — Verify clean operational state and authentication**
  - Verify login/change-PIN routing, RLS-sensitive access, schema health, and empty business data.
  - Check: all applicable diagnostics pass; record failures or unavailable checks explicitly.

- [x] **PIN-FIX-01 — Generalize PIN-change completion in PostgreSQL**
  - Add a new migration with a service-role-only completion RPC for every active profile role.
  - Preserve lockout reset, credential invalidation, audit actor, and audit reason behavior.
  - Check: SQL regression tests cover admin, supervisor, collector, inactive profile, and grants.

- [x] **PIN-FIX-02 — Generalize the change-pin Edge Function**
  - Accept every active profile and enforce access hours only for collectors.
  - Call the generic completion RPC after the Auth password update.
  - Check: local database tests, frontend tests, and production build pass.

- [x] **PIN-FIX-03 — Deploy and verify the repaired admin flow in DEV**
  - Deploy the new migration and `change-pin` Edge Function only to authorized DEV.
  - Exercise Edwin's real forced PIN-change flow and confirm post-change administrator access.
  - Check: login succeeds with the new PIN, `must_change_pin` clears, old PIN fails, and DEV data
    remains clean.

## Progress and Evidence

- Status: completed in DEV; PRD remains untouched and DEV-to-PRD transfer remains deferred.
- DEV-RESET-01 evidence:
  - `pnpm supabase projects list` resolved the linked project to Cobranza Pro Dev
    (`idwbhwfyfvyaqsefvlnc`); production was present but not linked.
  - Physical backups were unavailable, so a logical backup was created at
    `C:\Users\felbe\AppData\Local\Temp\cobranza-pro-dev-backup-20261109-123541`.
  - `roles.sql`, `schema.sql`, `data-auth-public-storage.sql`, and
    `migration-history.sql` are non-empty and recorded with SHA-256 hashes in `manifest.json`.
  - The first dump attempt failed because Docker Desktop was stopped; all resulting SQL files were
    empty and rejected. Docker was started and a new backup directory was validated successfully.
- DEV-RESET-01 runtime check: remote target and backup artifacts observed successfully.
- DEV-RESET-01 rollback boundary: no remote state changed; the backup directory can be removed
  independently after the DEV reset is accepted.
- DEV-RESET-01 commit: `6765b07` (`docs(ops): record DEV recovery backup`).
- DEV-RESET-02 evidence:
  - Local seed-free migration replay completed successfully.
  - `pnpm supabase db lint --local --level error` returned zero findings.
  - `pnpm supabase test db` passed 20 files and 436 tests.
  - Remote reset completed against `idwbhwfyfvyaqsefvlnc` with `--no-seed`; production was not
    targeted.
  - All 30 local and remote migration versions match.
  - Exact post-reset counts are zero for Auth users, profiles, customers, loans, installments,
    payments, cash movements, cash closures, correction requests, and allowance requests.
- DEV-RESET-02 runtime check: remote reset and zero-data verification observed successfully.
- DEV-RESET-02 rollback boundary: restore the validated logical backup into the rebuilt DEV schema
  if the reset must be reversed.
- DEV-RESET-02 commit: `6cba70d` (`chore(db): rebuild DEV without seed`).
- DEV-RESET-03 evidence:
  - Created one confirmed Auth user with the application email derived from DNI `40326721`.
  - Created the matching active `admin` profile for Edwin Enríquez Nizama.
  - Generated the temporary PIN with `node:crypto`; it was not written to the repository or memory
    artifacts.
  - Set `must_change_pin = true` so operational access requires replacement of the temporary PIN.
  - Exact verification returned one Auth user, one matching admin profile, and zero customers,
    loans, and payments.
- DEV-RESET-03 runtime check: Auth and profile identity/count checks passed.
- DEV-RESET-03 rollback boundary: delete the single Auth user; the profile is protected by the
  Auth foreign key and contains no dependent operational data.
- DEV-RESET-03 commit: `bd89ad7` (`chore(auth): bootstrap DEV administrator`).
- DEV-RESET-04 evidence:
  - The deployed `login` Edge Function authenticated DNI `40326721` with the generated temporary
    PIN and returned a valid session.
  - Authenticated profile retrieval returned exactly one active admin with
    `must_change_pin = true`; the smoke-test session was revoked immediately.
  - Remote database lint returned zero error-level findings.
  - A dynamic exact-count check verified every public table except `profiles` is empty, with
    exactly one Auth user and the requested active admin profile.
- DEV-RESET-04 runtime check: login, profile access, session revocation, remote lint, and complete
  clean-state verification passed.
- DEV-RESET-04 rollback boundary: delete the administrator or restore the pre-reset logical backup,
  depending on whether only bootstrap or the full reset must be reversed.
- DEV-RESET-04 commit: `bfdfe67` (`chore(ops): verify clean DEV bootstrap`).
- PIN-FIX-01 evidence:
  - Added `service_complete_pin_change(uuid)` for every active profile while restricting execution
    to `service_role`.
  - Preserved the collector-only compatibility function and its historical audit reason for safe
    rolling deployment.
  - Added 15 regression assertions covering grants, unknown/inactive profiles, every active role,
    audit attribution, lockout reset, and compatibility behavior.
  - A first full run exposed the changed legacy audit reason; the compatibility function was
    corrected and the complete suite then passed: 21 files and 451 tests.
  - Local migration replay and database lint completed with zero errors; generated database types
    include the generic completion function.
- PIN-FIX-01 runtime check: local migration replay, SQL lint, and all pgTAP tests passed.
- PIN-FIX-01 rollback boundary: remove the new migration, regression file, and generated generic
  function type before deployment; the legacy collector function remains independently usable.
- PIN-FIX-01 commit: `7a0f22a` (`fix(auth): generalize PIN change completion`).
- PIN-FIX-02 evidence:
  - The Edge Function now accepts every active profile instead of requiring the collector role.
  - Collector access-hour enforcement remains inside the collector-only branch.
  - Successful Auth password updates now call `service_complete_pin_change`.
  - The complete local database suite passed: 21 files and 451 tests.
  - `pnpm test:ci` passed 26 files and 189 tests.
  - `pnpm build` passed with only the existing bundle-budget and CommonJS warnings.
- PIN-FIX-02 runtime check: SQL tests, frontend tests, and the production build passed.
- PIN-FIX-02 rollback boundary: redeploy the previous Edge Function while the legacy collector RPC
  remains available; active non-collector profiles would return to the prior forced-PIN dead end.
- PIN-FIX-02 commit: `c5bdffd` (`fix(auth): allow active roles to change PIN`).
- PIN-FIX-03 evidence:
  - The linked target was rechecked as Cobranza Pro Dev (`idwbhwfyfvyaqsefvlnc`); PRD remained
    unlinked and was never targeted.
  - The remote dry-run listed only `20261109182103_generalize_self_service_pin_change.sql` and no
    seed, role, or unrelated migration changes.
  - Applied the migration and deployed only `change-pin`; the deployed function is active as
    version 2.
  - Edwin's real change-PIN request returned success, rejected the original temporary PIN, and
    accepted a newly generated secure PIN. The final profile is active `admin`, unlocked, with
    `must_change_pin = false` and zero failed attempts.
  - A local verification script failed after the successful change because Windows PowerShell
    rejects a raw `Range` header. Access was recovered through the authorized Admin Auth API with
    another securely generated final PIN, then login and profile state were reverified.
  - A temporary read-only public-data dump verified all 11 operational tables remain empty; the
    dump was deleted immediately after the check.
  - Local and DEV migration histories match through `20261109182103`; remote database lint returned
    zero findings.
- PIN-FIX-03 runtime check: deployment, real authentication, old-PIN rejection, final login,
  profile state, empty operational data, migration parity, function status, and remote lint passed.
- PIN-FIX-03 rollback boundary: redeploy the previous Edge Function and reverse the generic RPC in
  a new migration if required; the legacy collector completion function remains available.
- Running authored line count before Slice C evidence commit: 608.
- Review outcome: disabled/unmanaged.

## Next Step

The team can continue testing in DEV. DEV-to-PRD transfer requires a separate explicit
authorization after acceptance.
