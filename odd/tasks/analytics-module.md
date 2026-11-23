# Analytics module

Objective: Move the historical and comparative financial analysis out of the admin Dashboard into a lazy `/admin/analiticas` module, as defined in `ANALITICAS_ESPECIFICACION_TECNICA.md`. Branch: `ray`. Delivery strategy: user-owned commits; all changes remain unstaged. Test runners: focused Vitest and Playwright locally, pgTAP in CI.

## Specs

1. **S1 — Dashboard stays operational.** The Dashboard answers "how is the business right now". It no longer shows the period selector, reference-date navigation or financial charts, and `AdminDashboardStore.load()` no longer requests the financial series. It links to Analíticas with "Ver análisis detallado".
2. **S2 — Lazy Analíticas module.** Route `/admin/analiticas` (admin and supervisor through the existing `adminCanMatch`) with its own `AnalyticsStore` and `ANALYTICS_REPOSITORY` provided only on that route. Chart.js components are rendered only from this route.
3. **S3 — Reuse the existing RPC.** `SupabaseAnalyticsRepository` calls `admin_dashboard_financial_series` unchanged; no migration. The pgTAP file `admin_dashboard_financial_series_test.sql` already covers permissions, bucket limits, Lima boundaries, voids, reversals and empty buckets.
4. **S4 — Correct temporal semantics.** Every indicator of this series is a **flow**, so totals over the window are valid. State indicators (outstanding balance, active clients, delinquency) are not added, and period-over-period comparison is not implemented until the client approves its definition (spec §7, §17).
5. **S5 — Concurrency.** The store is a `resource()` keyed by granularity and reference date with the `AbortSignal` forwarded to Supabase; a period change aborts the in-flight request and a late response never replaces a newer selection. The reference date is validated as a real calendar date before querying.
6. **S6 — UX and accessibility.** Mobile-first, one chart per block, keyboard-operable controls, visible inclusive period limits, a visible detail table with totals plus a per-chart accessible table, skeleton loading, empty state, and an error state with retry.
7. **S7 — Verification.** Adapter, store, calculation and chart unit tests; Playwright for the menu entry, a single query per granularity change, collector denial, no historical query on the Dashboard, and the responsive smoke at 360/768/1280; build confirms independent lazy chunks.

## Tasks

- [x] **T1** — S2-S3: model, repository interface, Supabase adapter (with `AbortSignal` and error translation) and adapter spec.
- [x] **T2** — S4-S5: pure calculations (`summarizeSeries`, `seriesPeriod`, `isValidReferenceDate`, `shiftReferenceDate`, labels) and `AnalyticsStore` with specs.
- [x] **T3** — S2, S6: move `FinancialSeriesChart` to `analytics/` (kinds `profit` and `cashflow`), build the page with KPI cards, charts, detail table and states.
- [x] **T4** — S1: remove the series from the Dashboard store, repository, adapter, template and component; add the link to Analíticas.
- [x] **T5** — S2, S7: lazy route, entry in the real navigation (`shell/app-shell.ts`), Playwright specs, `AGENTS.md`.

## Log

- **L1 — 2026-11-22 (user):** Asked to read `ANALITICAS_ESPECIFICACION_TECNICA.md` and implement it.
- **L2 — 2026-11-22 (scope):** The financial series already lived in the Dashboard (`dashboard-financial-charts.md`), so this is an extraction, not a new feature. The second chart changed from "Salidas de caja" (disbursements plus expenses) to "Desembolsos frente a cobros" as the spec requests; expenses remain in the first chart and the table.
- **L3 — 2026-11-22 (not implemented, by design):** "Gastos por categoría" needs a category split the RPC does not return and a new RPC with an approved definition (spec Fase 4). Period-over-period comparison waits for client approval (spec §4.2, §17). Viáticos are not counted as expenses: approved allowances are a cash inflow to the collector and the RPC excludes them on purpose.
- **L4 — 2026-11-22 (navigation):** `shell/sidebar/sidebar.ts` is not imported anywhere (dead code); the rendered menu is inline in `shell/app-shell.ts`, which is where the entry was added.
- **L5 — 2026-11-22 (user feedback):** The first version was wrong: "Diario" showed the whole month and summed it (a day with no collections showed S/ 1,814 net profit), and the weekly/monthly/annual tabs were fixed windows. The user asked for exact periods, a custom range, more business charts and per-collector performance.
- **L6 — 2026-11-22 (correction):** Presets are now Día (default: today), Semana (Monday–Sunday), Mes, Año and Rango personalizado, each showing **only** that period. New migration `20261123020000_admin_analytics_rpcs.sql` adds `admin_analytics_series` (exact range + bucket + optional collector), `admin_analytics_collectors` and `admin_analytics_expense_categories` with pgTAP `admin_analytics_test.sql` (CI-only: Docker is not available locally). `admin_dashboard_financial_series` stays untouched and unused.
- **L7 — 2026-11-22 (added):** per-collector comparison table + chart (collections, interest, payments, clients attended, disbursements, expenses, net profit), collector filter, expense-by-category chart and table, "Hoy" shortcut, and a visible empty state when nothing moved. The screen supersedes L3's "not implemented" note for expenses by category.
- **L8 — 2026-11-22 (still pending client approval):** period-over-period comparison and state indicators (outstanding balance, delinquency) — see spec §7 and §17.
