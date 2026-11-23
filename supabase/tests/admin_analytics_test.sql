begin;

select set_config(
  'app.test_business_timestamp',
  ('2026-11-15 12:00:00'::timestamp at time zone 'America/Lima')::text,
  true
);
set local timezone to 'America/Lima';
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Every fixture date lives in 2031 so the local seed data can never leak into the totals.
insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'analytics.admin@test.local'),
  ('e1000000-0000-0000-0000-000000000002', 'analytics.supervisor@test.local'),
  ('e1000000-0000-0000-0000-000000000003', 'analytics.collector-a@test.local'),
  ('e1000000-0000-0000-0000-000000000004', 'analytics.collector-b@test.local');

insert into public.profiles (id, dni, full_name, role, active) values
  ('e1000000-0000-0000-0000-000000000001', '95000001', 'Analytics Admin', 'admin', true),
  ('e1000000-0000-0000-0000-000000000002', '95000002', 'Analytics Supervisor', 'supervisor', true),
  ('e1000000-0000-0000-0000-000000000003', '95000003', 'Analytics Collector A', 'collector', true),
  ('e1000000-0000-0000-0000-000000000004', '95000004', 'Analytics Collector B', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values
  (
    'e2000000-0000-0000-0000-000000000001', '96000001', 'Analytics Client A',
    'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', true
  ),
  (
    'e2000000-0000-0000-0000-000000000002', '96000002', 'Analytics Client B',
    'e1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', true
  );

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount,
  installment_count, frequency, started_on, first_due_on, status, created_by
) values
  (
    'e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001',
    100.00, 20.0000, 120.00, 100.00, 1, 'monthly', '2031-02-01', '2031-03-01', 'active',
    'e1000000-0000-0000-0000-000000000001'
  ),
  (
    'e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002',
    100.00, 20.0000, 120.00, 100.00, 1, 'monthly', '2031-02-01', '2031-03-01', 'active',
    'e1000000-0000-0000-0000-000000000001'
  );

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values
  ('e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 1, '2031-03-01', 120.00),
  ('e4000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', 1, '2031-03-01', 120.00);

-- Interest share of every payment is (120 - 100) / 120 = one sixth of the allocated amount.
insert into public.payments (
  id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by
) values
  ('e5000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000003', 60.00, 'cash', 'posted', '2031-03-10',
   '2031-03-10 15:00:00+00', 'e1000000-0000-0000-0000-000000000003'),
  ('e5000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002',
   'e1000000-0000-0000-0000-000000000004', 60.00, 'cash', 'posted', '2031-03-10',
   '2031-03-10 15:00:00+00', 'e1000000-0000-0000-0000-000000000004'),
  ('e5000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000003', 30.00, 'cash', 'posted', '2031-03-11',
   '2031-03-11 15:00:00+00', 'e1000000-0000-0000-0000-000000000003'),
  ('e5000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000003', 20.00, 'cash', 'posted', '2031-03-12',
   '2031-03-12 15:00:00+00', 'e1000000-0000-0000-0000-000000000003'),
  ('e5000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000002',
   'e1000000-0000-0000-0000-000000000004', 30.00, 'cash', 'posted', '2031-04-01',
   '2031-04-01 15:00:00+00', 'e1000000-0000-0000-0000-000000000004');

insert into public.payment_allocations (payment_id, installment_id, amount) values
  ('e5000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 60.00),
  ('e5000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000002', 60.00),
  ('e5000000-0000-0000-0000-000000000003', 'e4000000-0000-0000-0000-000000000001', 30.00),
  ('e5000000-0000-0000-0000-000000000004', 'e4000000-0000-0000-0000-000000000001', 20.00),
  ('e5000000-0000-0000-0000-000000000005', 'e4000000-0000-0000-0000-000000000002', 30.00);

-- Voided after being allocated, mirroring production order; it must not contribute.
update public.payments
set
  status = 'voided',
  voided_at = '2031-03-13 00:00:00+00',
  voided_by = 'e1000000-0000-0000-0000-000000000001',
  void_reason = 'test void'
where id = 'e5000000-0000-0000-0000-000000000004';

insert into public.cash_movements (
  id, collector_id, customer_id, loan_id, reversal_of_id, direction, movement_type, amount,
  occurred_at, business_date, notes, created_by
) values
  ('e6000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003',
   'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', null,
   'outflow', 'loan_disbursement', 100.00, '2031-03-10 12:00:00+00', '2031-03-10',
   'disbursement A', 'e1000000-0000-0000-0000-000000000001'),
  ('e6000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003',
   'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'e6000000-0000-0000-0000-000000000001',
   'inflow', 'loan_void', 40.00, '2031-03-12 12:00:00+00', '2031-03-12',
   'partial reversal A', 'e1000000-0000-0000-0000-000000000001'),
  ('e6000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000004',
   'e2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', null,
   'outflow', 'loan_disbursement', 50.00, '2031-03-11 12:00:00+00', '2031-03-11',
   'disbursement B', 'e1000000-0000-0000-0000-000000000001');

insert into public.cash_movements (
  id, collector_id, direction, movement_type, amount, payment_method,
  occurred_at, business_date, notes, created_by
) values
  ('e6000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000003',
   'outflow', 'operating_expense', 5.00, 'cash', '2031-03-10 13:00:00+00', '2031-03-10',
   'approved fuel A', 'e1000000-0000-0000-0000-000000000001'),
  ('e6000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000004',
   'outflow', 'operating_expense', 8.00, 'cash', '2031-03-11 13:00:00+00', '2031-03-11',
   'approved meals B', 'e1000000-0000-0000-0000-000000000001');

insert into public.cash_expenses (
  id, collector_id, business_date, category, amount, status, cash_movement_id,
  requested_by, reviewed_by, reviewed_at
) values
  ('e7000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003',
   '2031-03-10', 'fuel', 5.00, 'approved', 'e6000000-0000-0000-0000-000000000004',
   'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001',
   '2031-03-10 14:00:00+00'),
  ('e7000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000004',
   '2031-03-11', 'meals', 8.00, 'approved', 'e6000000-0000-0000-0000-000000000005',
   'e1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001',
   '2031-03-11 14:00:00+00');

-- Pending expense: must never count.
insert into public.cash_expenses (
  id, collector_id, business_date, category, amount, status, requested_by
) values (
  'e7000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003',
  '2031-03-10', 'tolls', 7.00, 'pending', 'e1000000-0000-0000-0000-000000000003'
);

-- 1-6: privileges
select ok(
  not has_function_privilege('anon', 'public.admin_analytics_series(date,date,text,uuid)', 'EXECUTE'),
  'Anonymous callers cannot execute the analytics series'
);
select ok(
  not has_function_privilege('anon', 'public.admin_analytics_collectors(date,date)', 'EXECUTE'),
  'Anonymous callers cannot execute the collector breakdown'
);
select ok(
  not has_function_privilege('anon', 'public.admin_analytics_expense_categories(date,date,uuid)', 'EXECUTE'),
  'Anonymous callers cannot execute the expense breakdown'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_analytics_series(date,date,text,uuid)', 'EXECUTE'),
  'Authenticated callers may invoke the series subject to in-function authorization'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_analytics_collectors(date,date)', 'EXECUTE'),
  'Authenticated callers may invoke the collector breakdown subject to in-function authorization'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_analytics_expense_categories(date,date,uuid)', 'EXECUTE'),
  'Authenticated callers may invoke the expense breakdown subject to in-function authorization'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';

-- 7-8: a single day is exactly one bucket with only that day's movements
select is(
  (select count(*) from public.admin_analytics_series('2031-03-10', '2031-03-10', 'day')),
  1::bigint,
  'A one-day range returns exactly one bucket'
);
select results_eq(
  $$
    select collected_amount, interest_collected, loan_disbursements, operating_expenses,
           net_profit, payments_count
    from public.admin_analytics_series('2031-03-10', '2031-03-10', 'day')
  $$,
  $$ values (120.00::numeric, 20.00::numeric, 100.00::numeric, 5.00::numeric, 15.00::numeric, 2) $$,
  'A single day contains only that day collections, interest, disbursements and approved expenses'
);

-- 9: the whole month is still one aggregated bucket
select results_eq(
  $$
    select bucket_start, bucket_end, collected_amount, interest_collected, loan_disbursements,
           operating_expenses, net_profit
    from public.admin_analytics_series('2031-03-01', '2031-03-31', 'month')
  $$,
  $$ values (
    '2031-03-01'::date, '2031-03-31'::date, 150.00::numeric, 25.00::numeric, 110.00::numeric,
    13.00::numeric, 12.00::numeric
  ) $$,
  'A month bucket adds only March flows, excluding voids, pending expenses and other months'
);

-- 10: daily buckets over a month
select is(
  (select count(*) from public.admin_analytics_series('2031-03-01', '2031-03-31', 'day')),
  31::bigint,
  'Daily buckets over March return one row per day'
);

-- 11: weekly buckets are clipped to the requested range
select results_eq(
  $$
    select bucket_start, bucket_end
    from public.admin_analytics_series('2031-03-12', '2031-03-20', 'week')
    order by bucket_start
  $$,
  $$ values ('2031-03-12'::date, '2031-03-16'::date), ('2031-03-17'::date, '2031-03-20'::date) $$,
  'Weekly buckets never extend outside the requested range'
);

-- 12: another month is isolated
select is(
  (select collected_amount from public.admin_analytics_series('2031-04-01', '2031-04-30', 'month')),
  30.00::numeric,
  'A different month only contains its own collections'
);

-- 13-14: voided payment and reversed disbursement
select is(
  (select collected_amount from public.admin_analytics_series('2031-03-12', '2031-03-12', 'day')),
  0.00::numeric,
  'A voided payment does not count as collected'
);
select is(
  (select loan_disbursements from public.admin_analytics_series('2031-03-12', '2031-03-12', 'day')),
  (-40.00)::numeric,
  'A loan void reverses disbursements on its own business date'
);

-- 15: empty day
select results_eq(
  $$
    select collected_amount, interest_collected, loan_disbursements, operating_expenses,
           net_profit, payments_count
    from public.admin_analytics_series('2031-03-20', '2031-03-20', 'day')
  $$,
  $$ values (0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0) $$,
  'A day without movements returns zero values'
);

-- 16: collector filter
select results_eq(
  $$
    select collected_amount, interest_collected, loan_disbursements, operating_expenses,
           net_profit, payments_count
    from public.admin_analytics_series(
      '2031-03-01', '2031-03-31', 'month', 'e1000000-0000-0000-0000-000000000003'
    )
  $$,
  $$ values (90.00::numeric, 15.00::numeric, 60.00::numeric, 5.00::numeric, 10.00::numeric, 2) $$,
  'The collector filter restricts every flow to that collector'
);

-- 17-19: validation
select throws_ok(
  $$ select * from public.admin_analytics_series('2031-03-10', '2031-03-09', 'day') $$,
  '22023',
  'End date must not precede start date',
  'A range ending before it starts is rejected'
);
select throws_ok(
  $$ select * from public.admin_analytics_series('2031-03-01', '2031-03-31', 'quarter') $$,
  '22023',
  'Unsupported analytics bucket',
  'Unsupported buckets are rejected'
);
select throws_ok(
  $$ select * from public.admin_analytics_series('2010-01-01', '2031-03-31', 'year') $$,
  '22023',
  'Date range is too large',
  'Ranges beyond ten years are rejected'
);

-- 20-21: per collector breakdown
select results_eq(
  $$
    select collector_id, collected_amount, interest_collected, payments_count, clients_attended,
           loan_disbursements, operating_expenses, net_profit
    from public.admin_analytics_collectors('2031-03-01', '2031-03-31')
    where collector_id in (
      'e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000004'
    )
    order by collected_amount desc
  $$,
  $$ values
    ('e1000000-0000-0000-0000-000000000003'::uuid, 90.00::numeric, 15.00::numeric, 2, 1,
     60.00::numeric, 5.00::numeric, 10.00::numeric),
    ('e1000000-0000-0000-0000-000000000004'::uuid, 60.00::numeric, 10.00::numeric, 1, 1,
     50.00::numeric, 8.00::numeric, 2.00::numeric)
  $$,
  'Each collector gets its own collections, interest, disbursements, expenses and net profit'
);
select is(
  (select count(*) from public.admin_analytics_collectors('2031-03-10', '2031-03-10')
    where collector_id = 'e1000000-0000-0000-0000-000000000003' and collected_amount = 60.00),
  1::bigint,
  'The collector breakdown can be restricted to a single day'
);

-- 22-23: expense categories
select results_eq(
  $$
    select category::text, expense_count, spent_amount
    from public.admin_analytics_expense_categories('2031-03-01', '2031-03-31')
  $$,
  $$ values ('meals', 1, 8.00::numeric), ('fuel', 1, 5.00::numeric) $$,
  'Only approved expenses are grouped by category, largest first'
);
select results_eq(
  $$
    select category::text, spent_amount
    from public.admin_analytics_expense_categories(
      '2031-03-01', '2031-03-31', 'e1000000-0000-0000-0000-000000000003'
    )
  $$,
  $$ values ('fuel', 5.00::numeric) $$,
  'The expense breakdown can be filtered by collector'
);

-- 24: supervisors are allowed
set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.admin_analytics_series('2031-03-10', '2031-03-10', 'day')),
  1::bigint,
  'Supervisors may view the same analytics'
);

-- 25-26: collectors are rejected
set local request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select * from public.admin_analytics_series('2031-03-10', '2031-03-10', 'day') $$,
  '42501',
  'Only administrators or supervisors may view analytics',
  'Collectors cannot read the analytics series'
);
select throws_ok(
  $$ select * from public.admin_analytics_collectors('2031-03-10', '2031-03-10') $$,
  '42501',
  'Only administrators or supervisors may view analytics',
  'Collectors cannot read other collectors performance'
);

select * from finish();
rollback;
