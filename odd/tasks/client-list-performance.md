# Client list performance

Objective: Reduce admin client-list page latency by replacing the sequential customer and financial-status requests with one authorized page-scoped RPC. Branch: `ray`. Delivery strategy: `single-pr`. Test runners: focused Vitest, pgTAP in CI, remote DEV/UAT smoke only when explicitly authorized, then `pnpm test:ci` and `pnpm build` once at closure.

## Specs

1. **S1 — User-visible performance.** Preserve the report verbatim: `"Mostrando 1-10 de 90 clientes en el modulo de clientes se demora mucho al traer los clientes y cuando paso de pagina"`. A page change must fetch one server page and its financial summary through one repository call instead of two sequential Supabase requests.
2. **S2 — Preserve behavior.** Keep exact total counts, stable newest-first ordering, search by DNI/name, collector filtering, customer fields, outstanding amount, overdue days, blacklist state, desktop/mobile pagination, and existing create/update flows.
3. **S3 — Architecture and security.** Follow Model -> Repository -> Supabase adapter -> Store -> Component. The new SQL RPC must authorize admin/supervisor explicitly, use an empty `search_path`, calculate financial values only for page customer IDs, and revoke execution from `public` and `anon`.
4. **S4 — Request ordering.** Rapid filter, search, or page changes must not let an older response overwrite the latest page or loading state.
5. **S5 — Verification.** Add pgTAP coverage for authorization, paging, filters, totals, and financial summaries; add focused adapter/store tests; run full Angular tests and production build once at closure. Because local Supabase/Docker is unavailable, retain pgTAP for CI and do not attempt to start Docker.

## Tasks

- [x] **T1** — S1-S3, S5: add the page-scoped client RPC, explicit privileges, generated type entry, and pgTAP regression coverage. Route: inline. Status: implemented; pgTAP pending CI because local Docker is unavailable. Commit: pending (user-owned).
- [x] **T2** — S1, S2, S4, S5: replace the adapter's sequential reads with the RPC, preserve store behavior, and add focused unit tests. Route: inline. Status: focused tests passing. Commit: pending (user-owned).
- [x] **T3** — S5: format touched files, run focused checks, then run full `test:ci` and `build` once. Route: inline. Status: 196 full-suite tests passed and the production build completed; pgTAP remains pending CI. Commit: pending (user-owned).

## Log

- **L1 — 2026-11-21 (user):** `entonces empecemos con el cambio`
- **L2 — 2026-11-21 (evidence):** A client page currently performs a paged customer query followed by a sequential `customer_financial_status` lookup. Loans performs one page-scoped RPC. Existing customer ordering and collector-pagination indexes are already present.
- **L3 — 2026-11-21 (constraint):** Receipt-driven commit review is disabled for this clone per the user's prior instruction. Unrelated `.agents/mcp_config.json` and `cobranza_diaria_edwin.md` remain out of scope.
- **L4 — 2026-11-21 (RED):** The new adapter spec failed because `SupabaseClientRepository.list()` still called the sequential `customers` table query instead of the expected RPC.
- **L5 — 2026-11-21 (GREEN):** The adapter now maps `admin_list_clients_page`, the store retains abort-based latest-request ordering, and 7 focused adapter/store tests pass.
- **L6 — 2026-11-22 (verification):** The full Angular suite passed 196 tests across 28 files and the production build completed with only the pre-existing PDF/Excel CommonJS warnings.
- **L7 — 2026-11-22 (independent finding):** Verification found that an out-of-range page lost the filtered total because a row-carried count disappears when the page has no rows.
- **L8 — 2026-11-22 (RED/GREEN):** A regression test reproduced the empty-page total defect. The RPC now returns a count-only sentinel row, the adapter filters it from items, and 8 focused adapter/store tests pass. Independent recheck confirmed the blocker resolved. pgTAP remains pending CI.
- **L9 — 2026-11-22 (user preference):** The user owns all commits. The automatically-created local commit was removed with a mixed reset, preserving every implementation change unstaged.
