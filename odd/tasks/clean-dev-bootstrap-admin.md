# Clean DEV and Bootstrap Administrator

## Objective

Rebuild the authorized Cobranza Pro DEV Supabase project from repository migrations, leave it
without operational data, and bootstrap exactly one administrator.

## Problem and Why

DEV contains data that must be removed before the team starts validation. The repository seed is
local-only and would recreate fictional users and financial fixtures, so it must not run remotely.

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

## Delivery and Testing

- Delivery strategy: `ask-on-risk`.
- Forecast authored change: approximately 70 lines, excluding operational output.
- TDD: not applicable; this is an environment operation with backup and runtime verification.
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

## Progress and Evidence

- Status: complete; DEV is clean, healthy, and ready for administrator-led validation.
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
- Running authored line count: 138.
- Review outcome: disabled/unmanaged.

## Next Step

Hand the temporary credentials to the user securely and begin the planned DEV validation cycle.
