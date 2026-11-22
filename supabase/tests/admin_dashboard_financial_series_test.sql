begin;

select set_config(
  'app.test_business_timestamp',
  ('2026-11-15 12:00:00'::timestamp at time zone 'America/Lima')::text,
  true
);
set local timezone to 'America/Lima';
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'financial-series.admin@test.local'),
  ('f1000000-0000-0000-0000-000000000002', 'financial-series.supervisor@test.local'),
  ('f1000000-0000-0000-0000-000000000003', 'financial-series.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active) values
  ('f1000000-0000-0000-0000-000000000001', '93000001', 'Financial Series Admin', 'admin', true),
  ('f1000000-0000-0000-0000-000000000002', '93000002', 'Financial Series Supervisor', 'supervisor', true),
  ('f1000000-0000-0000-0000-000000000003', '93000003', 'Financial Series Collector', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values (
  'f2000000-0000-0000-0000-000000000001', '94000001', 'Financial Series Client',
  'f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', true
);

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount, disbursed_amount,
  installment_count, frequency, started_on, first_due_on, status, created_by
) values
  (
    'f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
    100.00, 20.0000, 120.00, 100.00, 1, 'monthly', '2026-10-01', '2026-11-01', 'active',
    'f1000000-0000-0000-0000-000000000001'
  ),
  (
    'f3000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001',
    10.00, 20.0000, 12.00, 10.00, 1, 'monthly', '2026-09-01', '2026-10-01', 'paid',
    'f1000000-0000-0000-0000-000000000001'
  );

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values
  (
    'f4000000-0000-0000-0000-000000000001',
    'f3000000-0000-0000-0000-000000000001', 1, '2026-11-01', 120.00
  ),
  (
    'f4000000-0000-0000-0000-000000000002',
    'f3000000-0000-0000-0000-000000000002', 1, '2026-10-01', 12.00
  );

-- The UTC timestamp falls on November 2, but the persisted business date is November 1 in Lima.
insert into public.payments (
  id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by
) values (
  'f5000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000003', 120.00, 'cash', 'posted', '2026-11-01',
  '2026-11-02 04:30:00+00', 'f1000000-0000-0000-0000-000000000003'
);
insert into public.payment_allocations (payment_id, installment_id, amount)
values (
  'f5000000-0000-0000-0000-000000000001',
  'f4000000-0000-0000-0000-000000000001', 120.00
);

-- Voided payments and their retained allocations must not contribute.
insert into public.payments (
  id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by
) values (
  'f5000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002',
  'f1000000-0000-0000-0000-000000000003', 12.00, 'cash', 'posted', '2026-11-01',
  '2026-11-02 04:30:00+00', 'f1000000-0000-0000-0000-000000000003'
);
insert into public.payment_allocations (payment_id, installment_id, amount)
values (
  'f5000000-0000-0000-0000-000000000002',
  'f4000000-0000-0000-0000-000000000002', 12.00
);
update public.payments
set
  status = 'voided',
  voided_at = '2026-11-03 00:00:00+00',
  voided_by = 'f1000000-0000-0000-0000-000000000001',
  void_reason = 'test void'
where id = 'f5000000-0000-0000-0000-000000000002';

-- Superseded allocations from repaired schedules must not contribute.
insert into public.payments (
  id, loan_id, collector_id, amount, payment_method, status, business_date, paid_at, created_by
) values (
  'f5000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000003', 60.00, 'cash', 'posted', '2026-11-01',
  '2026-11-01 18:00:00+00', 'f1000000-0000-0000-0000-000000000003'
);
insert into public.payment_allocations (
  payment_id, installment_id, amount, superseded_at, supersession_reason
) values (
  'f5000000-0000-0000-0000-000000000003',
  'f4000000-0000-0000-0000-000000000001', 60.00,
  '2026-11-01 19:00:00+00', 'test superseded allocation'
);

insert into public.cash_movements (
  id, collector_id, customer_id, loan_id, reversal_of_id, direction, movement_type, amount,
  occurred_at, business_date, notes, created_by
) values (
  'f6000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003',
  'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001',
  null, 'outflow', 'loan_disbursement', 100.00, '2026-11-01 12:00:00+00', '2026-11-01',
  'test disbursement', 'f1000000-0000-0000-0000-000000000001'
), (
  'f6000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000003',
  'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000001', 'inflow', 'loan_void', 50.00,
  '2026-11-02 12:00:00+00', '2026-11-02',
  'test partial reversal', 'f1000000-0000-0000-0000-000000000001'
);

insert into public.cash_movements (
  id, collector_id, direction, movement_type, amount, payment_method,
  occurred_at, business_date, notes, created_by
) values (
  'f6000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003',
  'outflow', 'operating_expense', 5.00, 'cash', '2026-11-01 13:00:00+00', '2026-11-01',
  'approved test expense', 'f1000000-0000-0000-0000-000000000001'
);
insert into public.cash_expenses (
  id, collector_id, business_date, category, amount, status, cash_movement_id,
  requested_by, reviewed_by, reviewed_at
) values (
  'f7000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003',
  '2026-11-01', 'fuel', 5.00, 'approved', 'f6000000-0000-0000-0000-000000000003',
  'f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001',
  '2026-11-01 14:00:00+00'
);
insert into public.cash_expenses (
  id, collector_id, business_date, category, amount, status, requested_by
) values (
  'f7000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000003',
  '2026-11-01', 'tolls', 7.00, 'pending', 'f1000000-0000-0000-0000-000000000003'
);
insert into public.cash_expenses (
  id, collector_id, business_date, category, amount, status, requested_by,
  reviewed_by, reviewed_at, rejection_reason
) values (
  'f7000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003',
  '2026-11-01', 'parking', 9.00, 'rejected', 'f1000000-0000-0000-0000-000000000003',
  'f1000000-0000-0000-0000-000000000001', '2026-11-01 14:00:00+00', 'not approved'
);

-- Approved allowances add collector cash but are not operating expenses.
insert into public.cash_movements (
  id, collector_id, direction, movement_type, amount,
  occurred_at, business_date, notes, created_by
) values (
  'f6000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000003',
  'inflow', 'allowance', 25.00, '2026-11-01 15:00:00+00', '2026-11-01',
  'approved allowance excluded from expenses', 'f1000000-0000-0000-0000-000000000001'
);
insert into public.cash_allowance_requests (
  id, collector_id, business_date, amount, notes, status, cash_movement_id,
  requested_by, reviewed_by, reviewed_at
) values (
  'f8000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003',
  '2026-11-01', 25.00, 'approved allowance', 'approved',
  'f6000000-0000-0000-0000-000000000004',
  'f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001',
  '2026-11-01 15:00:00+00'
);

-- Exercise the inclusive end of the visible week, month, and year.
insert into public.cash_movements (
  id, collector_id, customer_id, loan_id, direction, movement_type, amount,
  occurred_at, business_date, notes, created_by
) values
  (
    'f6000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000003',
    'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001',
    'outflow', 'loan_disbursement', 30.00, '2026-11-15 12:00:00+00', '2026-11-15',
    'weekly end boundary', 'f1000000-0000-0000-0000-000000000001'
  ),
  (
    'f6000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000003',
    'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001',
    'outflow', 'loan_disbursement', 40.00, '2026-11-30 12:00:00+00', '2026-11-30',
    'monthly end boundary', 'f1000000-0000-0000-0000-000000000001'
  ),
  (
    'f6000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000003',
    'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001',
    'outflow', 'loan_disbursement', 50.00, '2026-12-31 12:00:00+00', '2026-12-31',
    'annual end boundary', 'f1000000-0000-0000-0000-000000000001'
  );

select ok(
  not has_function_privilege('anon', 'public.admin_dashboard_financial_series(text,date)', 'EXECUTE'),
  'Anonymous callers cannot execute financial series'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_dashboard_financial_series(text,date)', 'EXECUTE'),
  'Authenticated callers may invoke financial series subject to in-function authorization'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.admin_dashboard_financial_series('daily', '2026-11-15')),
  30::bigint,
  'Daily view returns every day in the reference month'
);
select is(
  (select collected_amount from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-01'),
  120.00::numeric,
  'Collections use the persisted Lima business date and exclude voided payments'
);
select is(
  (select interest_collected from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-01'),
  20.00::numeric,
  'Posted allocations recognize interest in proportion to the loan interest share'
);
select is(
  (select operating_expenses from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-01'),
  5.00::numeric,
  'Approved operating expenses count once, while pending or rejected expenses do not'
);
select is(
  (select net_profit from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-01'),
  15.00::numeric,
  'Net profit is collected interest minus approved operating expenses'
);
select is(
  (select loan_disbursements from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-01'),
  100.00::numeric,
  'Original loan cash outflow is represented in its business-date bucket'
);
select is(
  (select loan_disbursements from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-02'),
  (-50.00)::numeric,
  'Loan void ledger inflows reverse disbursements in the reversal-date bucket'
);
select results_eq(
  $$
    select collected_amount, interest_collected, loan_disbursements, operating_expenses
    from public.admin_dashboard_financial_series('daily', '2026-11-15')
    where bucket_start = '2026-11-03'
  $$,
  $$ values (0::numeric, 0::numeric, 0::numeric, 0::numeric) $$,
  'Buckets without financial activity are returned with zero values'
);
select is(
  (select count(*) from public.admin_dashboard_financial_series('weekly', '2026-11-15')),
  12::bigint,
  'Weekly view returns twelve ISO Monday-based weeks'
);
select is(
  (select bucket_start from public.admin_dashboard_financial_series('weekly', '2026-11-15')
    order by bucket_start limit 1),
  '2026-08-24'::date,
  'Weekly view begins eleven Mondays before the reference week'
);
select is(
  (select loan_disbursements from public.admin_dashboard_financial_series('weekly', '2026-11-15')
    where bucket_start = '2026-11-09'),
  30.00::numeric,
  'Weekly aggregation includes activity on the Sunday bucket boundary'
);
select is(
  (select count(*) from public.admin_dashboard_financial_series('monthly', '2026-11-15')),
  12::bigint,
  'Monthly view returns twelve months'
);
select is(
  (select loan_disbursements from public.admin_dashboard_financial_series('monthly', '2026-11-15')
    where bucket_start = '2026-11-01'),
  120.00::numeric,
  'Monthly aggregation includes activity on the final calendar day'
);
select is(
  (select count(*) from public.admin_dashboard_financial_series('annual', '2026-11-15')),
  5::bigint,
  'Annual view returns five years'
);
select is(
  (select loan_disbursements from public.admin_dashboard_financial_series('annual', '2026-11-15')
    where bucket_start = '2026-01-01'),
  170.00::numeric,
  'Annual aggregation includes activity on December 31'
);

set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.admin_dashboard_financial_series('daily', '2026-11-15')),
  30::bigint,
  'Supervisors may view the same financial series'
);

set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select * from public.admin_dashboard_financial_series('daily', '2026-11-15') $$,
  '42501',
  'Only administrators or supervisors may view dashboard financial series',
  'Collectors cannot execute the financial series data query'
);

set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$ select * from public.admin_dashboard_financial_series('quarterly', '2026-11-15') $$,
  '22023',
  'Unsupported financial series granularity',
  'Unsupported granularities are rejected'
);

select * from finish();
rollback;
