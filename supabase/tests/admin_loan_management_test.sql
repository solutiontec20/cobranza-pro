begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

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
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '60000003',
    'Paid Loan Customer',
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    true
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    '60000004',
    'Closed Cash Customer',
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    true
  );

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_update_loan(uuid,numeric,numeric,public.loan_frequency,integer,date,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute admin_update_loan'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_update_loan(uuid,numeric,numeric,public.loan_frequency,integer,date,text)',
    'EXECUTE'
  ),
  'Authenticated callers may execute admin_update_loan subject to in-function authorization'
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

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.admin_update_loan(
      (select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'),
      101, 10, 'daily', 6, '2026-10-24', 'Unauthorized correction'
    )
  $$,
  '42501',
  'Only administrators may update loans',
  'Collectors cannot update loans'
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.admin_update_loan(
      (select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'),
      101, 10, 'daily', 6, '2026-10-24', '   '
    )
  $$,
  '22023',
  'Update reason is required',
  'Every loan update requires an audit reason'
);

select lives_ok(
  $$
    select * from public.admin_update_loan(
      (select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'),
      101, 10, 'daily', 6, '2026-10-24', 'Correct principal and term'
    )
  $$,
  'Administrators replace an unpaid active loan schedule atomically'
);

reset role;

select results_eq(
  $$
    select
      principal_amount,
      total_amount,
      disbursed_amount,
      installment_count::integer,
      frequency::text,
      started_on,
      first_due_on
    from public.loans
    where customer_id = '60000000-0000-0000-0000-000000000001'
  $$,
  $$ values (
    101.00::numeric,
    111.10::numeric,
    101.00::numeric,
    6,
    'daily'::text,
    '2026-10-24'::date,
    '2026-10-26'::date
  ) $$,
  'Loan terms, disbursed amount, and normalized first due date are updated'
);

select results_eq(
  $$
    select due_date
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
      and superseded_at is null
    order by installment_number
  $$,
  array[
    '2026-10-26'::date,
    '2026-10-27'::date,
    '2026-10-28'::date,
    '2026-10-29'::date,
    '2026-10-30'::date,
    '2026-11-02'::date
  ],
  'Replacement daily installments normalize weekends and use business days'
);

select results_eq(
  $$
    select scheduled_amount
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
      and superseded_at is null
    order by installment_number
  $$,
  array[
    18.52::numeric,
    18.52::numeric,
    18.52::numeric,
    18.52::numeric,
    18.52::numeric,
    18.50::numeric
  ],
  'Replacement schedule puts the rounding difference in the final installment'
);

select is(
  (
    select sum(scheduled_amount)
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
      and superseded_at is null
  ),
  111.10::numeric,
  'Replacement installments add up to the updated loan total'
);

select is(
  (
    select count(*)
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
  ),
  9::bigint,
  'Schedule replacement preserves all previous installments'
);

select is(
  (
    select count(*)
    from public.installments
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
      and superseded_at is not null
      and superseded_by = '50000000-0000-0000-0000-000000000002'
      and supersession_reason = 'Correct principal and term'
  ),
  3::bigint,
  'Previous installments retain who superseded them and why'
);

select is(
  (
    select count(*)
    from public.installment_balances
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
  ),
  6::bigint,
  'Installment balances exposes only the active replacement schedule'
);

select is(
  (
    select count(*)
    from public.installment_balances ib
    join public.installments i on i.id = ib.id
    where i.superseded_at is not null
  ),
  0::bigint,
  'Superseded installments never appear in installment balances'
);

select is(
  (
    select amount
    from public.cash_movements
    where loan_id = (
      select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000001'
    )
      and movement_type = 'loan_disbursement'
  ),
  101.00::numeric,
  'Changing principal updates the original loan disbursement'
);

select ok(
  exists (
    select 1
    from private.audit_log al
    join public.loans l on l.id = al.row_id
    where al.table_name = 'loans'
      and l.customer_id = '60000000-0000-0000-0000-000000000001'
      and al.actor_user_id = '50000000-0000-0000-0000-000000000002'
      and al.reason = 'Correct principal and term'
      and (al.old_data ->> 'principal_amount')::numeric = 100.00
      and (al.new_data ->> 'principal_amount')::numeric = 101.00
  ),
  'Loan updates retain the administrator, reason, and before/after values'
);

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.admin_create_loan(
      '60000000-0000-0000-0000-000000000003', 80, 5, 'weekly', 4,
      '2026-10-20', '2026-10-20'
    )
  $$,
  'Payment-history test loan is created'
);

reset role;

insert into public.payments (
  loan_id,
  collector_id,
  amount,
  payment_method,
  status,
  created_by,
  voided_at,
  voided_by,
  void_reason
)
select
  l.id,
  c.collector_id,
  1.00,
  'cash',
  'voided',
  '50000000-0000-0000-0000-000000000002',
  now(),
  '50000000-0000-0000-0000-000000000002',
  'Historical payment fixture'
from public.loans l
join public.customers c on c.id = l.customer_id
where l.customer_id = '60000000-0000-0000-0000-000000000003';

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.admin_update_loan(
      (select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000003'),
      85, 5, 'weekly', 4, '2026-10-20', 'Attempt after voided payment'
    )
  $$,
  '22023',
  'Loans with payment history cannot be updated',
  'Even voided payment history blocks loan editing'
);

select lives_ok(
  $$
    select * from public.admin_create_loan(
      '60000000-0000-0000-0000-000000000004', 50, 0, 'monthly', 2,
      '2026-10-20', '2026-10-20'
    )
  $$,
  'Cash-closure test loan is created'
);

reset role;

insert into public.cash_closures (
  collector_id,
  business_date,
  expected_amount,
  delivered_amount,
  status,
  submitted_at,
  created_by
)
select
  cm.collector_id,
  cm.business_date,
  0,
  0,
  'submitted',
  now(),
  cm.collector_id
from public.cash_movements cm
where cm.loan_id = (
  select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000004'
)
  and cm.movement_type = 'loan_disbursement';

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.admin_update_loan(
      (select id from public.loans where customer_id = '60000000-0000-0000-0000-000000000004'),
      55, 0, 'monthly', 2, '2026-10-20', 'Attempt after cash closure'
    )
  $$,
  '22023',
  'Principal cannot change after its cash closure exists',
  'A cash closure blocks corrections to its disbursement principal'
);

select * from finish();

rollback;
