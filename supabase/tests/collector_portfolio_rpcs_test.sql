begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email)
values
  ('71000000-0000-0000-0000-000000000001', 'collector-a-portfolio@test.local'),
  ('71000000-0000-0000-0000-000000000002', 'collector-b-portfolio@test.local'),
  ('71000000-0000-0000-0000-000000000003', 'inactive-collector-portfolio@test.local'),
  ('71000000-0000-0000-0000-000000000004', 'admin-portfolio@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('71000000-0000-0000-0000-000000000001', '81000001', 'Collector A', 'collector', true),
  ('71000000-0000-0000-0000-000000000002', '81000002', 'Collector B', 'collector', true),
  ('71000000-0000-0000-0000-000000000003', '81000003', 'Inactive Collector', 'collector', false),
  ('71000000-0000-0000-0000-000000000004', '81000004', 'Administrator', 'admin', true);

insert into public.customers (
  id,
  document_number,
  full_name,
  address,
  collector_id,
  created_by
)
values
  (
    '72000000-0000-0000-0000-000000000001',
    '82000001',
    'Collector A Without Loan',
    'Test address A',
    '71000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000004'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '82000002',
    'Collector B Customer',
    'Test address B',
    '71000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000004'
  );

select has_function(
  'public',
  'collector_create_customer_loan',
  array[
    'text', 'text', 'text', 'text', 'text', 'numeric', 'numeric',
    'loan_frequency', 'integer', 'date'
  ],
  'Collector customer and loan creation RPC exists'
);

select has_function(
  'public',
  'collector_list_portfolio',
  array['date'],
  'Collector portfolio RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.collector_create_customer_loan(text,text,text,text,text,numeric,numeric,public.loan_frequency,integer,date)',
    'EXECUTE'
  ),
  'Authenticated callers can execute collector creation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.collector_create_customer_loan(text,text,text,text,text,numeric,numeric,public.loan_frequency,integer,date)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute collector creation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.collector_list_portfolio(date)',
    'EXECUTE'
  ),
  'Authenticated callers can execute collector portfolio'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.collector_list_portfolio(date)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute collector portfolio'
);

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000004';

select throws_ok(
  $$
    select * from public.collector_create_customer_loan(
      '82000003', 'Admin Attempt', null, 'Test address', null,
      100, 10, 'daily', 3, '2026-10-17'
    )
  $$,
  '42501',
  'Only active collectors may create customers and loans',
  'Administrators cannot call the collector creation RPC'
);

set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000003';

select throws_ok(
  $$
    select * from public.collector_create_customer_loan(
      '82000003', 'Inactive Attempt', null, 'Test address', null,
      100, 10, 'daily', 3, '2026-10-17'
    )
  $$,
  '42501',
  'Only active collectors may create customers and loans',
  'Inactive collectors cannot create customers and loans'
);

set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.collector_create_customer_loan(
      'invalid', 'Invalid Customer', null, 'Test address', null,
      100, 10, 'daily', 3, '2026-10-17'
    )
  $$,
  '22023',
  'Customer document must contain 8 to 12 digits',
  'Invalid input aborts collector onboarding'
);

reset role;

select is(
  (select count(*) from public.customers where full_name = 'Invalid Customer'),
  0::bigint,
  'Failed onboarding leaves no customer behind'
);

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.collector_create_customer_loan(
      '82000003', 'Collector A New Customer', '999888777', 'Test address', 'Created in field',
      100, 10, 'daily', 3, '2026-10-17'
    )
  $$,
  'An active collector creates a customer and first loan atomically'
);

reset role;

select results_eq(
  $$
    select collector_id, created_by
    from public.customers
    where document_number = '82000003'
  $$,
  $$ values (
    '71000000-0000-0000-0000-000000000001'::uuid,
    '71000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'The authenticated collector is assigned as collector and creator'
);

select results_eq(
  $$
    select l.created_by, l.total_amount, l.first_due_on
    from public.loans l
    join public.customers c on c.id = l.customer_id
    where c.document_number = '82000003'
  $$,
  $$ values (
    '71000000-0000-0000-0000-000000000001'::uuid,
    110.00::numeric,
    '2026-10-17'::date
  ) $$,
  'The loan uses the collector identity and admin-aligned calculation'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    join public.customers c on c.id = l.customer_id
    where c.document_number = '82000003'
    order by i.installment_number
  $$,
  array['2026-10-17'::date, '2026-10-19'::date, '2026-10-20'::date],
  'Daily schedules include Saturday and skip Sunday only'
);

select results_eq(
  $$
    select i.scheduled_amount
    from public.installments i
    join public.loans l on l.id = i.loan_id
    join public.customers c on c.id = l.customer_id
    where c.document_number = '82000003'
    order by i.installment_number
  $$,
  array[36.67::numeric, 36.67::numeric, 36.66::numeric],
  'The final installment absorbs the rounding difference'
);

select is(
  (
    select cm.amount
    from public.cash_movements cm
    join public.customers c on c.id = cm.customer_id
    where c.document_number = '82000003'
      and cm.direction = 'outflow'
      and cm.movement_type = 'loan_disbursement'
  ),
  100.00::numeric,
  'Atomic onboarding records the cash outflow'
);

insert into public.payments (
  loan_id,
  collector_id,
  amount,
  payment_method,
  paid_at,
  business_date,
  status,
  created_by
)
select
  l.id,
  c.collector_id,
  10.00,
  'cash',
  '2026-10-17 15:00:00+00'::timestamptz,
  '2026-10-17'::date,
  'posted',
  c.collector_id
from public.loans l
join public.customers c on c.id = l.customer_id
where c.document_number = '82000003';

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.collector_list_portfolio('2026-10-17')),
  2::bigint,
  'Collector A portfolio includes active customers with and without loans'
);

select results_eq(
  $$
    select remaining_balance, today_scheduled_amount, today_outstanding_amount,
      today_collected_amount
    from public.collector_list_portfolio('2026-10-17')
    where document_number = '82000003'
  $$,
  $$ values (100.00::numeric, 36.67::numeric, 36.67::numeric, 10.00::numeric) $$,
  'Portfolio derives real balance from posted payments and daily amounts from the requested date'
);

select results_eq(
  $$
    select loan_id, remaining_balance, today_scheduled_amount, today_collected_amount
    from public.collector_list_portfolio('2026-10-17')
    where document_number = '82000001'
  $$,
  $$ values (null::uuid, 0.00::numeric, 0.00::numeric, 0.00::numeric) $$,
  'Portfolio returns zero financial values for an active customer without a loan'
);

select ok(
  (
    select overdue_days > 0
    from public.collector_list_portfolio('2026-10-17')
    where document_number = '82000003'
  ),
  'Portfolio exposes overdue days for outstanding past installments'
);

select is(
  (
    select count(*)
    from public.collector_list_portfolio('2026-10-17')
    where document_number = '82000002'
  ),
  0::bigint,
  'Collector A cannot read Collector B portfolio rows'
);

set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000002';

select results_eq(
  $$
    select document_number
    from public.collector_list_portfolio('2026-10-17')
  $$,
  array['82000002'::text],
  'Collector B receives only their own portfolio'
);

set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000004';

select throws_ok(
  $$ select * from public.collector_list_portfolio('2026-10-17') $$,
  '42501',
  'Only active collectors may list a portfolio',
  'Non-collectors cannot call the collector portfolio RPC'
);

select * from finish();

rollback;
