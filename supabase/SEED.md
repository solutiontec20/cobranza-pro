# Local seed data (`supabase/seed.sql`)

`supabase/seed.sql` loads automatically on `supabase db start` / `supabase db reset`
(see `[db.seed]` in `supabase/config.toml`). It only affects the **local** Supabase
stack — it never touches the hosted "Cobranza Pro Dev" or "Cobranza Pro / Prod"
projects.

All names, DNIs and amounts below are **fictional**, invented for testing. No real
customer data (e.g. from an operational report) was used to build this seed.

Every loan and payment is created by calling the real Postgres RPCs
(`admin_create_loan`, `register_payment`, `void_payment`, `submit_cash_closure`,
`validate_cash_closure`) — not by hand-inserting rows — so schedules, rounding,
cash-ledger entries and loan-status transitions are produced by the exact same
logic the application uses in production. The seed simulates each actor the same
way `supabase/tests/*.sql` already does (`set local role authenticated; set local
request.jwt.claim.sub = '<uuid>';`), so it is consistent with the project's existing
test conventions.

## Test logins

Every seeded user can log in through the real `/login` screen (DNI + PIN), because
the seed creates a fully working `auth.users` + `auth.identities` row for each one
(bcrypt-hashed password via `pgcrypto`), not just a bare `profiles` row.

**PIN for every seeded user: `123456`.** This is intentionally simple for local QA.
`isWeakPin()` would reject it if someone tried to set it again through the real
change-pin flow — that check lives in the `change-pin` Edge Function, not in the
database, so it does not block this seed.

| Role | DNI | Full name | Notes |
|---|---|---|---|
| admin | `10000001` | Admin Demo | |
| supervisor | `10000002` | Supervisor Demo | |
| collector | `20000001` | Marco Rivas Delgado | Owns Portfolio A |
| collector | `20000002` | Daniela Soto Paredes | Owns Portfolio B |
| collector | `20000003` | Jorge Paredes Luna | `must_change_pin = true` — logging in redirects to `/cambiar-pin` |

## Business scenarios covered

| # | Customer | Portfolio | Frequency | Rate | Scenario | REQUERIMIENTO.md section |
|---|---|---|---|---|---|---|
| 3.1 | Rosa Delia Huaman Ponce | A | daily | 20% | Paid up to date (`on_track`) | §5 pago completo |
| 3.2 | Jorge Luis Castillo Vera | A | weekly | 20% | Partial payment, shortfall carried to the next due date | §5 pago parcial |
| 3.3 | Diana Patricia Reyes Soto | A | daily | 20% | Advance payment covering today + 2 future installments | §5 pago adelantado |
| 3.4 | Jose Antonio Vargas Lima | A | monthly | 15% | Mild overdue (≤5 days), not blacklisted | §4 calendario mensual / §6 atraso |
| 3.5 | Flor Elizabeth Campos Diaz | A | daily | 20% | >5 days overdue → automatically blacklisted (derived from `customer_financial_status.is_blacklisted`) | §6 lista negra |
| 3.6 | Ricardo Fabian Nunez Ortiz | A | weekly | 20% | Single installment, paid in full → loan `status = 'paid'` | §3 cálculo de cuota |
| 3.7 | Carla Beatriz Salinas Vega | A | — | — | No loan yet — use this customer to test "crear préstamo" | §7 un préstamo activo |
| 3.8 | Hugo Martin Delgado Rios | B | daily | 20% | Mirrors 3.1, under collector B — use with 3.1 to verify **portfolio isolation** | Security: collector A must not see collector B's portfolio |
| 3.9 | Patricia Noemi Flores Chavez | B | weekly | 30% | >5 days overdue → blacklisted, under collector B | §6 lista negra |
| 3.10 | Elena Sofia Paredes Luna | B | daily | 20% | Payment registered, then voided by the admin with a reason (`payments.status='voided'`, original row preserved) | §8 correcciones — nunca se borra un pago |
| §4 | — | C | — | — | Collector C (no seeded customers/loans) submits today's zero-movement cash closure (`submit_cash_closure`), admin validates it (`validate_cash_closure`) — chosen deliberately because every other collector's portfolio has loan disbursements dated today that outweigh today's collections, which would make the computed expected amount negative and violate `cash_closures`' non-negative check constraints | §9 cierre de caja diario |

## Known gap

No scenario demonstrates a loan **renewal** (`loans.previous_loan_id` / `status =
'renewed'`) — there is currently no RPC that performs a renewal end-to-end
(`admin_create_loan` always sets `previous_loan_id = null`). If that RPC is added
later, extend this seed with a renewal scenario and add a row to the table above.

## Regenerating / re-running

```bash
pnpm supabase db start   # first time: applies migrations, then runs this seed
pnpm supabase db reset   # re-applies migrations + this seed from scratch
```

Both commands require Docker (the CLI runs the local Postgres/Auth/Storage stack in
containers). If `seed.sql` fails specifically on the `auth.users` / `auth.identities`
inserts, compare the columns used here against `\d auth.users` / `\d auth.identities`
in the local stack — those two tables belong to Supabase's own Auth (GoTrue) schema,
not to this repo's migrations, and their exact shape can change across CLI versions.
