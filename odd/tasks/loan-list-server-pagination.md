# Loan list server pagination

Objective: Replace the unbounded admin loan-list reads with server-side pagination and make the empty eligible-client state actionable without changing loan eligibility rules.
Branch: `ray`. Delivery strategy: `single-pr`, split into reviewable work-unit commits if the implementation exceeds roughly 400 authored lines. Test runners: focused Angular/Vitest, pgTAP, then `pnpm test:ci`, `pnpm build`, and `pnpm supabase test db` once at closure.

## Specs

1. **S1 — Fix the broken loan list.** Preserve the user report verbatim: `"El préstamo no tiene un cronograma de cuotas válido."` must no longer be caused by the Supabase/PostgREST 1000-row cap when the admin loan list loads. Acceptance: loans are paged on the server; the list query returns one summary row per loan plus a total count; balances/payments are not downloaded in full by the browser.
2. **S2 — Preserve filters and pagination UX.** Preserve the requested outcome verbatim: `"dale una solucion a eso ahora mismo"`. Search, status, collector, frequency, page index, and page size must be repository-backed rather than filtering an already-loaded full dataset. Desktop and mobile must use the same page state.
3. **S3 — Explain the empty client selector without weakening finance rules.** Preserve the user report verbatim: `"si le doy nuevo prestamomen el campo clinete no me muestra los clientes tampoco"`. Continue showing only active customers without an active loan. When none exist, explain why and provide a route to register a client. Do not allow a second active loan for the same customer.
4. **S4 — Keep architecture and security consistent.** Follow the Model -> Repository -> Supabase adapter -> Store -> route/component pattern. Any new SQL RPC must explicitly authorize admin/supervisor, use a fixed `search_path`, expose only required fields, and ship with pgTAP coverage. Existing loan-detail, mutation, RLS, and financial rules remain unchanged.
5. **S5 — Verify proportionately.** Observe focused RED before implementation where deterministic tests exist, then GREEN. Run focused Angular specs while developing; run full Angular tests and the production build once at block closure. Keep pgTAP coverage for CI, but because the user has no local Supabase/Docker, validate the migration against the connected DEV/UAT project with controlled transactional/read-only checks instead of running `pnpm supabase test db` locally. Verify the DEV/UAT data case with more than 1000 installment rows.

## Tasks

- [x] **T1** — S1, S4: add a paginated loan-summary RPC and pgTAP coverage. Route: inline. Status: completed; migration versions aligned with DEV and fixtures isolated from seed data. Commit: `5e1b18a` plus the follow-up CI fix.
- [x] **T2** — S1, S2, S4: add page models/repository contract, Supabase mapping, store state, and server-driven paginator/filter behavior. Route: inline. Status: completed. Commit: `5e1b18a`.
- [x] **T3** — S3: add an actionable empty state for eligible clients without changing eligibility. Route: inline. Status: completed. Commit: `5e1b18a`.
- [x] **T4** — S5: run focused and closure checks, then independent verification because the change touches an authenticated SECURITY DEFINER read contract. Route: delegated verification only. Status: completed with pgTAP retained for CI and controlled DEV/UAT transaction checks. Commit: n/a.

## Log

- **L1 — 2026-11-20 (user):** `entonces implementa los cambios necesarios`
- **L2 — 2026-11-20 (evidence):** DEV/UAT has 87 loans, 2081 `installment_balances` rows, 74 payments, and 87 active customers. All 87 active customers currently have an active loan, so zero customers are eligible for another active loan.
- **L3 — 2026-11-20 (decision):** Use one additive paginated summary RPC rather than raising the global row cap or downloading page child rows. Keep the existing one-active-loan rule and improve only the empty-state explanation.
- **L4 — 2026-11-20 (user):** `no tengo supabase local que es con docker no tengo`
- **L5 — 2026-11-20 (verification adjustment):** The focused pgTAP command could not reach `127.0.0.1:54322`. Preserve the SQL regression test for CI and use the connected DEV/UAT project for controlled migration smoke checks; do not attempt Docker again.
- **L6 — 2026-11-20 (CI correction):** CI exposed that seed loans were included in three count assertions. The pgTAP fixture now scopes page/count/frequency assertions to its dedicated collector.
- **L7 — 2026-11-20 (security correction):** Supabase local default privileges granted `anon` direct EXECUTE on the new function. An additive migration explicitly revokes EXECUTE from both `public` and `anon`, while retaining `authenticated` access subject to the RPC role check.
- **L8 — 2026-11-20 (migration history):** Local filenames were aligned to DEV versions `20261120161614` and `20261120205034`; `supabase db push --linked --dry-run` now reports only the new permission-hardening migration as pending.
