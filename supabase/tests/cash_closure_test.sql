begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ============================================================
-- REQUERIMIENTO.md section 9 ("Cierre de caja diario"):
--
-- "El sistema muestra cuanto deberia haber cobrado y cuanto
-- registro realmente. El cobrador entrega el dinero ... El
-- supervisor o el administrador valida que lo entregado coincida
-- con lo registrado. Si hay diferencia, queda anotada con su
-- observacion."
--
-- schema_test.sql only asserts that submit_cash_closure and
-- validate_cash_closure exist with the right signature. This file
-- exercises their actual behavior: expected-amount calculation,
-- difference recording with an observation, the submit -> correct
-- -> validate lifecycle, and the role/status guards around it.
-- ============================================================

insert into auth.users (id, email)
values
  ('90000000-0000-0000-0000-000000000001', 'closure.admin@test.local'),
  ('90000000-0000-0000-0000-000000000002', 'closure.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('90000000-0000-0000-0000-000000000001', '90000001', 'Closure Admin', 'admin', true),
  ('90000000-0000-0000-0000-000000000002', '90000002', 'Closure Collector', 'collector', true);

-- Today's cash movements for the collector: 80.00 collected,
-- 20.00 disbursed -> expected net amount = 60.00.

insert into public.cash_movements (
  collector_id, direction, movement_type, amount, business_date, created_by
)
values
  (
    '90000000-0000-0000-0000-000000000002', 'inflow', 'collection',
    80.00, current_date, '90000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000002', 'outflow', 'loan_disbursement',
    20.00, current_date, '90000000-0000-0000-0000-000000000001'
  );

-- ============================================================
-- TEST 1-2
-- EXECUTE privileges follow the project's authenticated-only
-- convention (same pattern as admin_update_loan).
-- ============================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.submit_cash_closure(date,numeric,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute submit_cash_closure'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_cash_closure(date,numeric,text)',
    'EXECUTE'
  ),
  'Authenticated callers may execute submit_cash_closure subject to in-function authorization'
);

-- ============================================================
-- TEST 3
-- Only collectors submit their own cash closure.
-- ============================================================

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_date, 60.00, 'Intento no autorizado'
    )
  $$,
  '42501',
  'Only collectors may submit their cash closure',
  'Administrators cannot submit a cash closure on their own'
);

set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000002';

-- ============================================================
-- TEST 4
-- Delivered amount cannot be negative.
-- ============================================================

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_date, -1.00, 'Monto invalido'
    )
  $$,
  '22023',
  'Delivered amount cannot be negative',
  'A collector cannot deliver a negative amount'
);

-- ============================================================
-- TEST 5
-- Delivered amount may contain at most two decimals.
-- ============================================================

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_date, 60.123, 'Monto invalido'
    )
  $$,
  '22023',
  'Delivered amount may contain at most two decimals',
  'A delivered amount cannot have more than two decimals'
);

-- ============================================================
-- TEST 6
-- Future cash closures are not allowed.
-- ============================================================

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_date + 1, 10.00, 'Cierre adelantado'
    )
  $$,
  '22023',
  'Future cash closures are not allowed',
  'A collector cannot close a day that has not happened yet'
);

-- ============================================================
-- TEST 7
-- A collector submits today's closure with a delivered amount
-- that differs from the expected amount, with an observation.
-- ============================================================

select lives_ok(
  $$
    select * from public.submit_cash_closure(
      current_date, 55.00, 'Falto efectivo, se reviso la ruta'
    )
  $$,
  'A collector can submit their closure for today'
);

-- ============================================================
-- TEST 8
-- The closure records the computed expected amount, the
-- delivered amount, the resulting difference, and the
-- observation -- exactly as REQUERIMIENTO.md section 9 requires.
-- ============================================================

select results_eq(
  $$
    select
      expected_amount,
      delivered_amount,
      difference_amount,
      status::text,
      observation
    from public.cash_closures
    where collector_id = '90000000-0000-0000-0000-000000000002'
      and business_date = current_date
  $$,
  $$ values (
    60.00::numeric,
    55.00::numeric,
    -5.00::numeric,
    'submitted'::text,
    'Falto efectivo, se reviso la ruta'::text
  ) $$,
  'The difference between delivered and expected cash is recorded with its observation'
);

-- ============================================================
-- TEST 9
-- Before validation, the collector can correct their submission
-- (upsert, not a second row).
-- ============================================================

select lives_ok(
  $$
    select * from public.submit_cash_closure(
      current_date, 60.00, 'Correccion: efectivo completo'
    )
  $$,
  'A collector can resubmit their closure before it is validated'
);

-- ============================================================
-- TEST 10
-- The resubmission updates the same row instead of creating a
-- second one for the same collector and business date.
-- ============================================================

select results_eq(
  $$
    select
      count(*),
      max(delivered_amount),
      max(difference_amount)
    from public.cash_closures
    where collector_id = '90000000-0000-0000-0000-000000000002'
      and business_date = current_date
  $$,
  $$ values (1::bigint, 60.00::numeric, 0.00::numeric) $$,
  'Resubmitting a closure updates the existing row instead of duplicating it'
);

-- ============================================================
-- TEST 11
-- Only administrators or supervisors validate a cash closure.
-- ============================================================

select throws_ok(
  $$
    select * from public.validate_cash_closure(
      (
        select id from public.cash_closures
        where collector_id = '90000000-0000-0000-0000-000000000002'
          and business_date = current_date
      ),
      'Autovalidacion no permitida'
    )
  $$,
  '42501',
  'Only administrators or supervisors may validate cash closures',
  'A collector cannot validate their own cash closure'
);

-- ============================================================
-- TEST 12
-- The administrator validates the closure.
-- ============================================================

set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.validate_cash_closure(
      (
        select id from public.cash_closures
        where collector_id = '90000000-0000-0000-0000-000000000002'
          and business_date = current_date
      ),
      'Efectivo verificado'
    )
  $$,
  'An administrator can validate a submitted cash closure'
);

-- ============================================================
-- TEST 13
-- The closure is marked validated, by the administrator.
-- ============================================================

select results_eq(
  $$
    select status::text, validated_by
    from public.cash_closures
    where collector_id = '90000000-0000-0000-0000-000000000002'
      and business_date = current_date
  $$,
  $$ values (
    'validated'::text,
    '90000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'A validated cash closure records who validated it'
);

-- ============================================================
-- TEST 14
-- A validated cash closure can never be resubmitted.
-- ============================================================

set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_date, 60.00, 'Intento de reenvio'
    )
  $$,
  '22023',
  'Validated cash closure cannot be resubmitted',
  'A validated cash closure cannot be submitted again'
);

select * from finish();

rollback;
