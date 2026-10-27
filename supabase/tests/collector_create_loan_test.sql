begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email)
values
  ('93000000-0000-0000-0000-000000000001', 'create-loan.collector.a@test.local'),
  ('93000000-0000-0000-0000-000000000002', 'create-loan.collector.b@test.local'),
  ('93000000-0000-0000-0000-000000000003', 'create-loan.admin@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('93000000-0000-0000-0000-000000000001', '93000001', 'Create Loan Collector A', 'collector', true),
  ('93000000-0000-0000-0000-000000000002', '93000002', 'Create Loan Collector B', 'collector', true),
  ('93000000-0000-0000-0000-000000000003', '93000003', 'Create Loan Administrator', 'admin', true);

-- Customer with no loan at all (e.g. registered by an admin without a loan).
insert into public.customers (id, document_number, full_name, address, collector_id, created_by, active)
values
  (
    '94000000-0000-0000-0000-000000000001',
    '94000001',
    'Loanless Customer',
    'Test address 1',
    '93000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000003',
    true
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    '94000002',
    'Other Collector Loanless Customer',
    'Test address 2',
    '93000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000003',
    true
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    '94000003',
    'Inactive Customer',
    'Test address 3',
    '93000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000003',
    false
  );

-- ------------------------------------------------------------
-- Function privileges
-- ------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon',
    'public.collector_create_loan(uuid,numeric,numeric,public.loan_frequency,integer,date)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute collector_create_loan'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.collector_create_loan(uuid,numeric,numeric,public.loan_frequency,integer,date)',
    'EXECUTE'
  ),
  'Authenticated callers may execute collector_create_loan subject to in-function authorization'
);

-- ------------------------------------------------------------
-- A collector creates a loan for their own loanless customer
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.collector_create_loan(
      '94000000-0000-0000-0000-000000000001', 100, 10, 'daily', 3, current_date
    )
  $$,
  'A collector creates a first loan for their own customer with no loan history'
);

reset role;

select results_eq(
  $$
    select l.status, l.previous_loan_id, l.disbursed_amount, l.total_amount
    from public.loans l
    where l.customer_id = '94000000-0000-0000-0000-000000000001'
  $$,
  $$ values ('active'::public.loan_status, null::uuid, 100.00::numeric, 110.00::numeric) $$,
  'The new loan is active, unlinked to any previous loan, and fully disbursed'
);

select is(
  (
    select cm.amount
    from public.cash_movements cm
    where cm.customer_id = '94000000-0000-0000-0000-000000000001'
      and cm.direction = 'outflow'
      and cm.movement_type = 'loan_disbursement'
  ),
  100.00::numeric,
  'The disbursement is recorded as a cash outflow for the full principal'
);

-- ------------------------------------------------------------
-- The same collector cannot create a second active loan
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.collector_create_loan(
      '94000000-0000-0000-0000-000000000001', 50, 10, 'daily', 2, current_date
    )
  $$,
  '23505',
  'Customer already has an active loan',
  'A customer with an active loan cannot get a second one'
);

-- ------------------------------------------------------------
-- A collector cannot create a loan for another collector's customer
-- ------------------------------------------------------------

select throws_ok(
  $$
    select * from public.collector_create_loan(
      '94000000-0000-0000-0000-000000000002', 100, 10, 'daily', 3, current_date
    )
  $$,
  '42501',
  'Collector cannot create loans for another portfolio',
  'Collector A cannot create a loan for Collector B''s customer'
);

-- ------------------------------------------------------------
-- A collector cannot create a loan for an inactive customer
-- ------------------------------------------------------------

select throws_ok(
  $$
    select * from public.collector_create_loan(
      '94000000-0000-0000-0000-000000000003', 100, 10, 'daily', 3, current_date
    )
  $$,
  '22023',
  'Cannot create a loan for an inactive customer',
  'An inactive customer cannot receive a new loan'
);

reset role;

-- ------------------------------------------------------------
-- Non-collectors cannot call this RPC
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-0000-0000-000000000003';

select throws_ok(
  $$
    select * from public.collector_create_loan(
      '94000000-0000-0000-0000-000000000002', 100, 10, 'daily', 3, current_date
    )
  $$,
  '42501',
  'Only active collectors may create loans for their customers',
  'Administrators cannot call the collector loan-creation RPC'
);

reset role;

-- ------------------------------------------------------------
-- Collector B creates a loan for their own loanless customer
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.collector_create_loan(
      '94000000-0000-0000-0000-000000000002', 200, 20, 'weekly', 4, current_date
    )
  $$,
  'Collector B creates a loan for their own customer'
);

reset role;

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.customer_id = '94000000-0000-0000-0000-000000000002'
    order by i.installment_number
  $$,
  array[
    current_date,
    current_date + 7,
    current_date + 14,
    current_date + 21
  ],
  'A weekly schedule lands on the same weekday every week'
);

select * from finish();

rollback;
