begin;

set local timezone to 'America/Lima';

create extension if not exists pgtap with schema extensions;

select plan(10);

-- ============================================================
-- Fixtures are built so every bucket/branch of
-- admin_dashboard_summary / admin_dashboard_collector_performance
-- is exercised with a distinct, hand-computed expected value:
--
-- c1: due today, unpaid        -> risk GREEN  (0 days overdue)
-- c2: due yesterday, partially
--     paid today               -> risk YELLOW (1 day overdue)
-- c3: due 7 days ago, unpaid   -> risk ORANGE  (7 days overdue)
-- c4: due 15 days ago, unpaid  -> risk RED     (15 days overdue)
-- c5: no loan at all           -> counted in total_clientes, but
--                                  must NOT leak into any risk bucket
-- c6: a PAID-OFF loan          -> must NOT contribute to
--                                  capital_prestado/total_esperado/
--                                  total_cobrado, but DOES count
--                                  toward prestamos_pagados
-- ============================================================

insert into auth.users (id, email)
values
  ('e1000000-0000-0000-0000-000000000001', 'db.admin@test.local'),
  ('e1000000-0000-0000-0000-000000000002', 'db.supervisor@test.local'),
  ('e1000000-0000-0000-0000-000000000003', 'db.collector.a@test.local'),
  ('e1000000-0000-0000-0000-000000000004', 'db.collector.b@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('e1000000-0000-0000-0000-000000000001', '91000001', 'DB Admin', 'admin', true),
  ('e1000000-0000-0000-0000-000000000002', '91000002', 'DB Supervisor', 'supervisor', true),
  ('e1000000-0000-0000-0000-000000000003', '91000003', 'DB Collector A', 'collector', true),
  ('e1000000-0000-0000-0000-000000000004', '91000004', 'DB Collector B', 'collector', false);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values
  ('e2000000-0000-0000-0000-000000000001', '92000001', 'Cliente Uno', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true),
  ('e2000000-0000-0000-0000-000000000002', '92000002', 'Cliente Dos', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true),
  ('e2000000-0000-0000-0000-000000000003', '92000003', 'Cliente Tres', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true),
  ('e2000000-0000-0000-0000-000000000004', '92000004', 'Cliente Cuatro', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true),
  ('e2000000-0000-0000-0000-000000000005', '92000005', 'Cliente Cinco', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true),
  ('e2000000-0000-0000-0000-000000000006', '92000006', 'Cliente Seis', 'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true);

-- L1 (Cliente Uno): active, due today, unpaid -> green, feeds expected_today.
insert into public.loans (id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount, installment_count, frequency, started_on, first_due_on, status, created_by)
values ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 100.00, 20.0000, 120.00, 100.00, 1, 'daily', current_date, current_date, 'active', 'e1000000-0000-0000-0000-000000000001');
insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 1, current_date, 10.00);

-- L2 (Cliente Dos): active, due yesterday, partially paid today -> yellow, feeds collected_today.
insert into public.loans (id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount, installment_count, frequency, started_on, first_due_on, status, created_by)
values ('e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 50.00, 20.0000, 60.00, 50.00, 1, 'daily', current_date - 1, current_date - 1, 'active', 'e1000000-0000-0000-0000-000000000001');
insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('e4000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', 1, current_date - 1, 20.00);
insert into public.payments (id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by)
values ('e5000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003', 5.00, 'cash', 'posted', current_date, now(), 'e1000000-0000-0000-0000-000000000003');
insert into public.payment_allocations (payment_id, installment_id, amount)
values ('e5000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000002', 5.00);

-- L3 (Cliente Tres): active, 7 days overdue, unpaid -> orange.
insert into public.loans (id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount, installment_count, frequency, started_on, first_due_on, status, created_by)
values ('e3000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000003', 70.00, 20.0000, 84.00, 70.00, 1, 'daily', current_date - 7, current_date - 7, 'active', 'e1000000-0000-0000-0000-000000000001');
insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('e4000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-000000000003', 1, current_date - 7, 30.00);

-- L4 (Cliente Cuatro): active, 15 days overdue, unpaid -> red.
insert into public.loans (id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount, installment_count, frequency, started_on, first_due_on, status, created_by)
values ('e3000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000004', 90.00, 20.0000, 108.00, 90.00, 1, 'daily', current_date - 15, current_date - 15, 'active', 'e1000000-0000-0000-0000-000000000001');
insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('e4000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-000000000004', 1, current_date - 15, 40.00);

-- Cliente Cinco intentionally has no loan at all.

-- L6 (Cliente Seis): already fully paid off -- must not count toward
-- capital_prestado/total_esperado/total_cobrado, only toward prestamos_pagados.
insert into public.loans (id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount, installment_count, frequency, started_on, first_due_on, status, created_by)
values ('e3000000-0000-0000-0000-000000000006', 'e2000000-0000-0000-0000-000000000006', 200.00, 20.0000, 240.00, 200.00, 1, 'daily', current_date - 10, current_date - 10, 'paid', 'e1000000-0000-0000-0000-000000000001');
insert into public.payments (id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by)
values ('e5000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000003', 240.00, 'cash', 'posted', current_date - 2, now(), 'e1000000-0000-0000-0000-000000000003');

-- ============================================================
-- TEST 1-3: admin_dashboard_summary authorization.
-- ============================================================

select ok(
  not has_function_privilege('anon', 'public.admin_dashboard_summary()', 'EXECUTE'),
  'Anonymous callers cannot execute admin_dashboard_summary'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_dashboard_summary()', 'EXECUTE'),
  'Authenticated callers may execute admin_dashboard_summary subject to in-function authorization'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000003';

select throws_ok(
  $$ select * from public.admin_dashboard_summary() $$,
  '42501',
  'Only administrators or supervisors may view the dashboard',
  'Collectors cannot view the dashboard summary'
);

-- ============================================================
-- TEST 4: Every KPI and risk bucket matches the hand-computed
-- expectation above, in a single row.
-- ============================================================

set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    select
      capital_prestado, total_esperado, total_cobrado, saldo_pendiente,
      total_clientes, prestamos_pagados, cobradores,
      risk_green, risk_yellow, risk_orange, risk_red
    from public.admin_dashboard_summary()
  $$,
  $$ values (
    310.00::numeric, 372.00::numeric, 5.00::numeric, 95.00::numeric,
    6::bigint, 1::bigint, 1::bigint,
    1::bigint, 1::bigint, 1::bigint, 1::bigint
  ) $$,
  'The dashboard summary matches every hand-computed KPI and risk bucket'
);

-- ============================================================
-- TEST 5-7: admin_dashboard_collector_performance authorization.
-- ============================================================

select ok(
  not has_function_privilege('anon', 'public.admin_dashboard_collector_performance()', 'EXECUTE'),
  'Anonymous callers cannot execute admin_dashboard_collector_performance'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_dashboard_collector_performance()', 'EXECUTE'),
  'Authenticated callers may execute admin_dashboard_collector_performance subject to in-function authorization'
);

set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000003';

select throws_ok(
  $$ select * from public.admin_dashboard_collector_performance() $$,
  '42501',
  'Only administrators or supervisors may view the dashboard',
  'Collectors cannot view collector performance'
);

-- ============================================================
-- TEST 8: Collector A's row matches every hand-computed figure.
-- ============================================================

set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    select clients_count, expected_today, collected_today, pending_today, delayed_count
    from public.admin_dashboard_collector_performance()
    where collector_id = 'e1000000-0000-0000-0000-000000000003'::uuid
  $$,
  $$ values (6::bigint, 10.00::numeric, 5.00::numeric, 5.00::numeric, 3::bigint) $$,
  'Collector A''s performance row matches every hand-computed figure'
);

-- ============================================================
-- TEST 9: An inactive collector never appears in the performance
-- table (nor counts toward "cobradores" above).
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.admin_dashboard_collector_performance()
    where collector_id = 'e1000000-0000-0000-0000-000000000004'::uuid
  $$,
  array[0::bigint],
  'An inactive collector never appears in the performance table'
);

-- ============================================================
-- TEST 10: Supervisors may also view both reports.
-- ============================================================

set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ select * from public.admin_dashboard_summary() $$,
  'Supervisors may also view the dashboard summary'
);

select * from finish();

rollback;
