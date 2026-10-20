begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'loan.collector@test.local'),
  ('50000000-0000-0000-0000-000000000002', 'loan.admin@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('50000000-0000-0000-0000-000000000001', '50000001', 'Loan Collector', 'collector', true),
  ('50000000-0000-0000-0000-000000000002', '50000002', 'Loan Administrator', 'admin', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '60000001',
    'Loan Customer',
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    true
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '60000002',
    'Small Loan Customer',
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    true
  );

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.admin_create_loan(
      '60000000-0000-0000-0000-000000000001', 100, 10, 'daily', 3,
      '2026-10-18', '2026-10-18'
    )
  $$,
  '42501',
  'Only administrators may create loans',
  'Collectors cannot create loans'
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.admin_create_loan(
      '60000000-0000-0000-0000-000000000001', 100, 10, 'daily', 3,
      '2026-10-18', '2026-10-18'
    )
  $$,
  'Administrators create a loan atomically'
);

reset role;

select is(
  (select first_due_on from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'),
  '2026-10-19'::date,
  'A daily first due date on Sunday moves to Monday'
);

select results_eq(
  $$
    select due_date
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
    order by installment_number
  $$,
  array['2026-10-19'::date, '2026-10-20'::date, '2026-10-21'::date],
  'Daily installments use business days'
);

select results_eq(
  $$
    select scheduled_amount
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
    order by installment_number
  $$,
  array[36.67::numeric, 36.67::numeric, 36.66::numeric],
  'The last installment absorbs the rounding difference'
);

select is(
  (
    select sum(scheduled_amount)
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
  ),
  110.00::numeric,
  'Installments add up to the loan total'
);

select is(
  (
    select amount
    from public.cash_movements
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
      and direction = 'outflow'
  ),
  100.00::numeric,
  'Loan creation records the principal as a cash outflow'
);

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.admin_create_loan(
      '60000000-0000-0000-0000-000000000001', 100, 10, 'weekly', 3,
      '2026-10-19', '2026-10-19'
    )
  $$,
  '23505',
  'Customer already has an active loan',
  'A customer cannot receive a second active loan'
);

select throws_ok(
  $$
    select * from public.admin_create_loan(
      '60000000-0000-0000-0000-000000000002', 0.01, 0, 'monthly', 2,
      '2026-10-19', '2026-10-19'
    )
  $$,
  '22023',
  'Installment amounts must be greater than zero',
  'A schedule cannot contain a zero-valued last installment'
);

select * from finish();

rollback;
