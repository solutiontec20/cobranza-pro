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

- [ ] **DEV-RESET-02 — Rebuild DEV without fixtures**
  - Reset the authorized remote database from repository migrations with seed disabled.
  - Check: migration history matches the repository and operational tables contain zero rows.

- [ ] **DEV-RESET-03 — Bootstrap the sole administrator**
  - Create the Auth user safely and the matching `public.profiles` row.
  - Require replacement of the generated temporary PIN.
  - Check: exactly one Auth user and one active admin profile exist.

- [ ] **DEV-RESET-04 — Verify clean operational state and authentication**
  - Verify login/change-PIN routing, RLS-sensitive access, schema health, and empty business data.
  - Check: all applicable diagnostics pass; record failures or unavailable checks explicitly.

## Progress and Evidence

- Status: DEV target verified and recovery backup completed; preparing the seed-free rebuild.
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
- Running authored line count: 0.
- Review outcome: disabled/unmanaged.

## Next Step

Validate migration replay without seed, then reset only the authorized DEV project.
