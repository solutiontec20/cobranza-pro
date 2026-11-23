# Dashboard financial charts

Objective: Add two Supabase-backed financial charts to the admin dashboard, sharing one period selector and preserving correct cash-flow/accounting semantics. Branch: `ray`. Delivery strategy: user-owned commits; all changes remain unstaged. Test runners: focused Vitest and pgTAP in CI, then one full `pnpm test:ci` and `pnpm build` at closure.

## Specs

1. **S1 — Requested charts.** Preserve the requirement verbatim: `"Agregar 2 graficos al dashboard un registro diario(importante), semanal, mensual y anual. uno para la utilidad. uno para los gastos -> gastos por prestamos y por viaticos."`
2. **S2 — Shared period control.** Both charts use one selector with `Diario`, `Semanal`, `Mensual`, and `Anual`. Daily is the default. Daily shows one bucket per day in the selected month; weekly shows 12 Monday-based weeks; monthly shows 12 months; annual shows 5 years. A reference-date control navigates the visible window.
3. **S3 — Profit definition.** Implement the accepted formula: utility equals interest effectively collected in each bucket minus approved operating expenses. Because the schema does not split installment principal and interest, recognize collected interest proportionally using `(total_amount - principal_amount) / total_amount` for posted payment allocations.
4. **S4 — Cash-outflow chart.** Label the second chart `Salidas de caja`, not accounting expenses. Show separate series for loan disbursements and approved operating/viaticum expenses. Approved allowances are not expenses by themselves and must not be counted twice.
5. **S5 — Data integrity.** Use America/Lima business dates, exclude or net reversed/voided financial activity according to existing ledger semantics, return empty buckets as zero, and keep buckets ordered.
6. **S6 — Architecture and security.** Follow Model -> Repository -> Supabase adapter -> Store -> Component. Use one read-only page-scoped RPC for both charts, explicitly authorize admin/supervisor, set an empty `search_path`, revoke execution from `public` and `anon`, and grant only `authenticated`.
7. **S7 — UX and performance.** Keep the dashboard mobile-first, accessible, responsive, PEN-formatted, and defer the chart presentation so Chart.js is not rendered before the section is needed. Loading, empty, and error states must remain understandable.
8. **S8 — Verification.** Add pgTAP coverage for permissions, period buckets, Lima boundaries, financial calculations, and reversals; add focused adapter/store/component-calculation tests; run the full Angular suite and production build once at closure. Local pgTAP remains pending CI because Docker/Supabase local is unavailable.

## Tasks

- [x] **T1** — S3-S6, S8: add the financial-series model/repository contract, secure RPC migration, generated type entry, Supabase adapter mapping, and pgTAP/adapter coverage. Route: delegated backend unit; disjoint core/Supabase surfaces. Status: implemented; adapter tests pass and pgTAP is pending CI. Commit: pending (user-owned).
- [x] **T2** — S1-S2, S7-S8: extend the dashboard store and build the shared selectors plus two responsive deferred Chart.js presentations with focused tests. Route: delegated frontend unit; disjoint dashboard surfaces. Status: implemented; store, calculation, and chart tests pass. Commit: pending (user-owned).
- [ ] **T3** — S1-S8: reconcile the backend/frontend seam, format touched files, run focused checks, independent high-risk verification, then full `test:ci` and `build` once. Route: inline. Status: CI exposed an invalid voided-payment fixture; corrected locally and awaiting CI pgTAP rerun. Commit: pending (user-owned).

## Log

- **L1 — 2026-11-22 (user):** `- Agregar 2 graficos al dashboard un registro diario(importante), semanal, mensual y anual. uno para la utilidad. uno para los gastos -> gastos por prestamos y por viaticos. esto como lo planteas ?? dame la planificacion seria como un select para que ponga diario semanal y mensual ?`
- **L2 — 2026-11-22 (accepted proposal):** One shared period selector controls both charts. The second chart is named `Salidas de caja`; loan disbursements are not accounting expenses. Recommended profit formula: interest effectively collected minus approved operating expenses.
- **L3 — 2026-11-22 (user):** `implementa los cambios`
- **L4 — 2026-11-22 (workflow):** The user owns every commit. Implementation stays unstaged and no commit, push, merge, remote migration, or deployment is authorized.
- **L5 — 2026-11-22 (forecast):** Expected authored change is approximately 700–1,000 lines across one database/core unit and one dashboard UI unit, including tests.
- **L6 — 2026-11-22 (T1):** Added the secure financial-series RPC, model/repository/adapter contract, generated function type, pgTAP coverage, and adapter tests. The RPC uses security invoker and existing RLS; local pgTAP remains pending CI.
- **L7 — 2026-11-22 (T2):** Added shared period/reference controls, latest-request-safe store loading, two deferred responsive Chart.js views, accessible summaries, and focused store/calculation/chart tests.
- **L8 — 2026-11-22 (seam):** Parent combined focused run passed 18 tests across four files.
- **L9 — 2026-11-22 (independent verification):** Verification found a deterministic pgTAP identity-order defect, stale charts displayed during period reload, and missing boundary fixtures. The correction restores the admin identity before validation, prioritizes loading UI, and covers allowances, superseded allocations, zero buckets, and week/month/year boundaries. Scoped recheck found no remaining blocker.
- **L10 — 2026-11-22 (closure):** Full Angular suite passed 208 tests across 30 files. Production build completed successfully. Existing initial-bundle and PDF/Excel CommonJS warnings remain; pgTAP is pending CI because local Supabase is unavailable.
- **L11 — 2026-11-22 (CI failure):** `admin_dashboard_financial_series_test.sql` attempted to insert an allocation after creating its payment directly as `voided`, so `private.validate_payment_allocation()` correctly raised `allocations can only be added to posted payments` before any TAP assertion ran.
- **L12 — 2026-11-22 (fixture correction):** The voided-payment fixture now mirrors production order: create a separate paid loan/installment, create the payment as `posted`, allocate it, then update it to `voided`. T3 remains open until CI executes pgTAP successfully.
- **L13 — 2026-11-22 (second CI failure):** The voided fixture passed, but monthly and annual boundary assertions compared global RPC totals against fixture-only values. The local test database seed already contributed 2,750.00 in those windows, producing 2,870.00 and 2,920.00.
- **L14 — 2026-11-22 (test isolation):** The test now captures monthly and annual seeded baselines before inserting fixtures and asserts the fixture delta. This preserves global RPC semantics while making pgTAP independent from seed totals. T3 remains open until CI reruns successfully.
- **L15 — 2026-11-22 (third CI failure):** The temporary baseline table was created by `postgres`, then populated under `authenticated` to execute the security-invoker RPC. PostgreSQL correctly denied the insert because table privileges do not follow `SET ROLE` automatically.
- **L16 — 2026-11-22 (temporary-table privileges):** The pgTAP setup now grants `SELECT, INSERT` on the session-local baseline table to `authenticated`. This permits baseline capture and later delta assertions without weakening any production table or RPC permission. T3 remains open until CI reruns successfully.
