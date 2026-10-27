begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- ============================================================
-- This RPC must report "as of p_business_date", not "as of
-- today" -- that is the whole reason it cannot simply reuse
-- installment_balances/customer_financial_status (both hardcode
-- "now"). The fixtures below deliberately post a payment AFTER
-- one of the two cutoff dates under test, so the point-in-time
-- behavior (that payment must be invisible to the earlier
-- cutoff, and visible to the later one) is actually exercised,
-- not just assumed.
-- ============================================================

insert into auth.users (id, email)
values
  ('d1000000-0000-0000-0000-000000000001', 'dc.admin@test.local'),
  ('d1000000-0000-0000-0000-000000000002', 'dc.supervisor@test.local'),
  ('d1000000-0000-0000-0000-000000000003', 'dc.collector.a@test.local'),
  ('d1000000-0000-0000-0000-000000000004', 'dc.collector.b@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('d1000000-0000-0000-0000-000000000001', '81000001', 'DC Admin', 'admin', true),
  ('d1000000-0000-0000-0000-000000000002', '81000002', 'DC Supervisor', 'supervisor', true),
  ('d1000000-0000-0000-0000-000000000003', '81000003', 'DC Collector A', 'collector', true),
  ('d1000000-0000-0000-0000-000000000004', '81000004', 'DC Collector B', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values
  (
    'd2000000-0000-0000-0000-000000000001', '82000001', 'Cliente Uno',
    'd1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', true
  ),
  (
    'd2000000-0000-0000-0000-000000000002', '82000002', 'Cliente Dos',
    'd1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', true
  ),
  (
    'd2000000-0000-0000-0000-000000000003', '82000003', 'Cliente Tres',
    'd1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', true
  ),
  (
    'd2000000-0000-0000-0000-000000000004', '82000004', 'Cliente Cuatro',
    'd1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', true
  );

-- ------------------------------------------------------------
-- Loan 1 (Cliente Uno, collector A): 3 daily installments.
-- A payment lands AFTER the first cutoff date under test, so the
-- two reports below must disagree about it.
-- ------------------------------------------------------------

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values (
  'd3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
  50.00, 20.0000, 60.00, 50.00, 3, 'daily',
  '2026-01-05', '2026-01-05', 'active', 'd1000000-0000-0000-0000-000000000001'
);

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values
  ('d4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 1, '2026-01-05', 20.00),
  ('d4000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001', 2, '2026-01-06', 20.00),
  ('d4000000-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000001', 3, '2026-01-07', 20.00);

insert into public.payments (
  id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by
)
values
  (
    'd5000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000003', 20.00, 'cash', 'posted',
    '2026-01-05', '2026-01-05T10:00:00Z', 'd1000000-0000-0000-0000-000000000003'
  ),
  (
    'd5000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000003', 20.00, 'cash', 'posted',
    '2026-01-08', '2026-01-08T10:00:00Z', 'd1000000-0000-0000-0000-000000000003'
  );

insert into public.payment_allocations (payment_id, installment_id, amount)
values
  ('d5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 20.00),
  ('d5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002', 20.00);

-- ------------------------------------------------------------
-- Loan 2 (Cliente Dos, collector A): fully paid, single installment.
-- ------------------------------------------------------------

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values (
  'd3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002',
  25.00, 20.0000, 30.00, 25.00, 1, 'daily',
  '2026-01-05', '2026-01-05', 'paid', 'd1000000-0000-0000-0000-000000000001'
);

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('d4000000-0000-0000-0000-000000000004', 'd3000000-0000-0000-0000-000000000002', 1, '2026-01-05', 30.00);

insert into public.payments (
  id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by
)
values (
  'd5000000-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000003', 30.00, 'cash', 'posted',
  '2026-01-05', '2026-01-05T10:00:00Z', 'd1000000-0000-0000-0000-000000000003'
);

insert into public.payment_allocations (payment_id, installment_id, amount)
values ('d5000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000004', 30.00);

-- ------------------------------------------------------------
-- Loan 3 (Cliente Tres, collector B): unpaid, used for the
-- collector_id filter checks.
-- ------------------------------------------------------------

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values (
  'd3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000003',
  12.50, 20.0000, 15.00, 12.50, 1, 'daily',
  '2026-01-05', '2026-01-05', 'active', 'd1000000-0000-0000-0000-000000000001'
);

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('d4000000-0000-0000-0000-000000000005', 'd3000000-0000-0000-0000-000000000003', 1, '2026-01-05', 15.00);

-- ------------------------------------------------------------
-- Loan 4 (Cliente Cuatro, collector A): one superseded
-- installment (due AFTER the replacement, 100.00) plus the real
-- active replacement (due 2026-01-10, 50.00). If the report ever
-- stopped filtering by superseded_at, end_date/scheduled_on_date
-- below would incorrectly reflect the superseded row instead.
-- ------------------------------------------------------------

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values (
  'd3000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000004',
  41.67, 20.0000, 50.00, 41.67, 1, 'daily',
  '2026-01-10', '2026-01-10', 'active', 'd1000000-0000-0000-0000-000000000001'
);

insert into public.installments (
  id, loan_id, installment_number, due_date, scheduled_amount,
  superseded_at, superseded_by, supersession_reason
)
values (
  'd4000000-0000-0000-0000-000000000006', 'd3000000-0000-0000-0000-000000000004', 1, '2026-01-15', 100.00,
  now(), 'd1000000-0000-0000-0000-000000000001', 'Replaced by corrected schedule (test fixture)'
);

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values ('d4000000-0000-0000-0000-000000000007', 'd3000000-0000-0000-0000-000000000004', 1, '2026-01-10', 50.00);

-- ============================================================
-- TEST 1-2: EXECUTE privileges follow the same authenticated-only
-- convention as every other admin/supervisor reporting RPC.
-- ============================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_daily_control_report(date,uuid)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute admin_daily_control_report'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_daily_control_report(date,uuid)',
    'EXECUTE'
  ),
  'Authenticated callers may execute admin_daily_control_report subject to in-function authorization'
);

-- ============================================================
-- TEST 3: Collectors cannot view the daily control report.
-- ============================================================

set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000003';

select throws_ok(
  $$ select * from public.admin_daily_control_report('2026-01-07'::date) $$,
  '42501',
  'Only administrators or supervisors may view the daily control report',
  'Collectors cannot view the daily control report'
);

-- ============================================================
-- TEST 4: A null business date is rejected.
-- ============================================================

set local request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from public.admin_daily_control_report(null) $$,
  '22023',
  'Business date is required',
  'A null business date is rejected'
);

-- ============================================================
-- TEST 5: As of 2026-01-07, the second payment (dated 2026-01-08)
-- must NOT be counted yet.
-- ============================================================

select results_eq(
  $$
    select
      scheduled_on_date, collected_on_date, paid_to_date,
      balance_as_of, oldest_unpaid_due_date, overdue_days
    from public.admin_daily_control_report('2026-01-07'::date)
    where loan_id = 'd3000000-0000-0000-0000-000000000001'::uuid
  $$,
  $$ values (
    20.00::numeric, 0.00::numeric, 20.00::numeric,
    40.00::numeric, '2026-01-06'::date, 1
  ) $$,
  'As of 2026-01-07, the payment dated 2026-01-08 is not yet counted'
);

-- ============================================================
-- TEST 6: As of 2026-01-09, the same loan now reflects that
-- payment, and the oldest unpaid installment has moved on.
-- ============================================================

select results_eq(
  $$
    select
      scheduled_on_date, collected_on_date, paid_to_date,
      balance_as_of, oldest_unpaid_due_date, overdue_days
    from public.admin_daily_control_report('2026-01-09'::date)
    where loan_id = 'd3000000-0000-0000-0000-000000000001'::uuid
  $$,
  $$ values (
    0.00::numeric, 0.00::numeric, 40.00::numeric,
    20.00::numeric, '2026-01-07'::date, 2
  ) $$,
  'As of 2026-01-09, the point-in-time report reflects the later payment'
);

-- ============================================================
-- TEST 7: A fully paid loan has a zero balance and no overdue
-- installment at the cutoff date.
-- ============================================================

select results_eq(
  $$
    select balance_as_of, oldest_unpaid_due_date, overdue_days
    from public.admin_daily_control_report('2026-01-07'::date)
    where loan_id = 'd3000000-0000-0000-0000-000000000002'::uuid
  $$,
  $$ values (0.00::numeric, null::date, 0) $$,
  'A fully paid loan reports a zero balance and no overdue installment'
);

-- ============================================================
-- TEST 8: Filtering by collector A excludes collector B's loan.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.admin_daily_control_report(
      '2026-01-07'::date, 'd1000000-0000-0000-0000-000000000003'::uuid
    )
    where loan_id = 'd3000000-0000-0000-0000-000000000003'::uuid
  $$,
  array[0::bigint],
  'Filtering by collector A excludes collector B''s loan'
);

-- ============================================================
-- TEST 9: Without a collector filter, every portfolio is included.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.admin_daily_control_report('2026-01-07'::date)
    where loan_id = 'd3000000-0000-0000-0000-000000000003'::uuid
  $$,
  array[1::bigint],
  'Without a collector filter, collector B''s loan is included too'
);

-- ============================================================
-- TEST 10: Supervisors may also view the report.
-- ============================================================

set local request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ select * from public.admin_daily_control_report('2026-01-07'::date) $$,
  'Supervisors may also view the daily control report'
);

-- ============================================================
-- TEST 11: A superseded installment never leaks into the report
-- -- only the active replacement schedule is reflected.
-- ============================================================

set local request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    select end_date, scheduled_on_date
    from public.admin_daily_control_report('2026-01-10'::date)
    where loan_id = 'd3000000-0000-0000-0000-000000000004'::uuid
  $$,
  $$ values ('2026-01-10'::date, 50.00::numeric) $$,
  'The superseded installment (due 2026-01-15, 100.00) never appears; only the active replacement does'
);

select * from finish();

rollback;
