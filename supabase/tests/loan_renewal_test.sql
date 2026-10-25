begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email)
values
  ('90000000-0000-0000-0000-000000000001', 'renewal.collector.a@test.local'),
  ('90000000-0000-0000-0000-000000000002', 'renewal.collector.b@test.local'),
  ('90000000-0000-0000-0000-000000000003', 'renewal.admin@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('90000000-0000-0000-0000-000000000001', '90000001', 'Renewal Collector A', 'collector', true),
  ('90000000-0000-0000-0000-000000000002', '90000002', 'Renewal Collector B', 'collector', true),
  ('90000000-0000-0000-0000-000000000003', '90000003', 'Renewal Administrator', 'admin', true);

insert into public.customers (id, document_number, full_name, address, collector_id, created_by, active)
values
  (
    '91000000-0000-0000-0000-000000000001',
    '91000001',
    'Up To Date Customer',
    'Test address 1',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000003',
    true
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    '91000002',
    'Blacklisted Customer',
    'Test address 2',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000003',
    true
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    '91000003',
    'Fully Paid Customer',
    'Test address 3',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000003',
    true
  ),
  (
    '91000000-0000-0000-0000-000000000004',
    '91000004',
    'Other Collector Customer',
    'Test address 4',
    '90000000-0000-0000-0000-000000000002',
    '90000000-0000-0000-0000-000000000003',
    true
  );

-- Fixture loans/installments are inserted directly (as the default superuser
-- role, matching the pattern used by financial_rpcs_test.sql) so due dates
-- can be anchored to the real current date deterministically, independent
-- of whatever day this suite actually runs.

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values
  (
    '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
    100.00, 10.0000, 110.00, 100.00, 3, 'daily', current_date, current_date,
    'active', '90000000-0000-0000-0000-000000000003'
  ),
  (
    '92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002',
    100.00, 10.0000, 110.00, 100.00, 3, 'daily', current_date - 10, current_date - 10,
    'active', '90000000-0000-0000-0000-000000000003'
  ),
  (
    '92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000003',
    100.00, 10.0000, 110.00, 100.00, 3, 'daily', current_date, current_date,
    'active', '90000000-0000-0000-0000-000000000003'
  ),
  (
    '92000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000004',
    100.00, 10.0000, 110.00, 100.00, 3, 'daily', current_date, current_date,
    'active', '90000000-0000-0000-0000-000000000003'
  );

insert into public.installments (loan_id, installment_number, due_date, scheduled_amount)
values
  -- Up to date customer: first installment due today, the rest in the future.
  ('92000000-0000-0000-0000-000000000001', 1, current_date, 36.67),
  ('92000000-0000-0000-0000-000000000001', 2, current_date + 1, 36.67),
  ('92000000-0000-0000-0000-000000000001', 3, current_date + 2, 36.66),
  -- Blacklisted customer: every installment is already more than 5 days overdue.
  ('92000000-0000-0000-0000-000000000002', 1, current_date - 10, 36.67),
  ('92000000-0000-0000-0000-000000000002', 2, current_date - 9, 36.67),
  ('92000000-0000-0000-0000-000000000002', 3, current_date - 8, 36.66),
  -- Fully paid customer.
  ('92000000-0000-0000-0000-000000000003', 1, current_date, 36.67),
  ('92000000-0000-0000-0000-000000000003', 2, current_date + 1, 36.67),
  ('92000000-0000-0000-0000-000000000003', 3, current_date + 2, 36.66),
  -- Other collector's customer.
  ('92000000-0000-0000-0000-000000000004', 1, current_date, 36.67),
  ('92000000-0000-0000-0000-000000000004', 2, current_date + 1, 36.67),
  ('92000000-0000-0000-0000-000000000004', 3, current_date + 2, 36.66);

-- ------------------------------------------------------------
-- Function privileges
-- ------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon',
    'public.renew_loan(uuid,numeric,numeric,public.loan_frequency,integer,date)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute renew_loan'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.renew_loan(uuid,numeric,numeric,public.loan_frequency,integer,date)',
    'EXECUTE'
  ),
  'Authenticated callers may execute renew_loan subject to in-function authorization'
);

-- ------------------------------------------------------------
-- Scenario 1: up-to-date customer (0 overdue days) can renew
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.register_payment(
      '92000000-0000-0000-0000-000000000001', 36.67, 'cash'
    )
  $$,
  'Collector registers a partial payment that fully covers the first installment'
);

select ok(
  (
    select coalesce(max(ib.overdue_days), 0) = 0
    from public.installment_balances ib
    where ib.loan_id = '92000000-0000-0000-0000-000000000001'
  ),
  'The up-to-date customer has zero overdue days after the partial payment'
);

select lives_ok(
  $$
    select * from public.renew_loan(
      '92000000-0000-0000-0000-000000000001',
      100, 10, 'daily', 3, current_date + 3
    )
  $$,
  'A collector can renew the loan of their own up-to-date customer'
);

reset role;

select results_eq(
  $$
    select status from public.loans
    where id = '92000000-0000-0000-0000-000000000001'
  $$,
  array['renewed'::public.loan_status],
  'The previous loan is marked as renewed'
);

select is(
  (
    select count(*)
    from public.loans
    where customer_id = '91000000-0000-0000-0000-000000000001'
      and status = 'active'::public.loan_status
  ),
  1::bigint,
  'Exactly one active loan remains for the renewed customer'
);

select results_eq(
  $$
    select previous_loan_id from public.loans
    where customer_id = '91000000-0000-0000-0000-000000000001'
      and status = 'active'::public.loan_status
  $$,
  array['92000000-0000-0000-0000-000000000001'::uuid],
  'The new loan links back to the previous loan via previous_loan_id'
);

select results_eq(
  $$
    select disbursed_amount from public.loans
    where customer_id = '91000000-0000-0000-0000-000000000001'
      and status = 'active'::public.loan_status
  $$,
  $$ values (26.67::numeric) $$,
  'Disbursed amount nets off the outstanding balance of the previous loan (100 - 73.33 outstanding)'
);

-- ------------------------------------------------------------
-- Scenario 2: blacklisted customer (> 5 overdue days) cannot renew
-- ------------------------------------------------------------

select ok(
  (
    select coalesce(max(ib.overdue_days), 0) > 5
    from public.installment_balances ib
    where ib.loan_id = '92000000-0000-0000-0000-000000000002'
  ),
  'The customer has accumulated more than 5 overdue days (is blacklisted)'
);

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.renew_loan(
      '92000000-0000-0000-0000-000000000002',
      100, 10, 'daily', 3, current_date
    )
  $$,
  '22023',
  'Blacklisted customers cannot renew their loan',
  'A blacklisted customer cannot renew their loan'
);

reset role;

select results_eq(
  $$
    select status from public.loans
    where id = '92000000-0000-0000-0000-000000000002'
  $$,
  array['active'::public.loan_status],
  'The blacklisted customer original loan stays untouched after the rejected renewal'
);

-- ------------------------------------------------------------
-- Scenario 3: fully paid loan (0 balance) can renew
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.register_payment(
      '92000000-0000-0000-0000-000000000003', 110.00, 'cash'
    )
  $$,
  'Collector pays off the loan in full'
);

select results_eq(
  $$
    select status from public.loans
    where id = '92000000-0000-0000-0000-000000000003'
  $$,
  array['paid'::public.loan_status],
  'The loan is fully paid off before renewal'
);

select lives_ok(
  $$
    select * from public.renew_loan(
      '92000000-0000-0000-0000-000000000003',
      100, 10, 'daily', 3, current_date
    )
  $$,
  'A customer who fully paid off their loan can renew'
);

reset role;

select results_eq(
  $$
    select disbursed_amount from public.loans
    where customer_id = '91000000-0000-0000-0000-000000000003'
      and status = 'active'::public.loan_status
  $$,
  $$ values (100.00::numeric) $$,
  'Disbursed amount equals full principal when there was no outstanding balance to net off'
);

-- ------------------------------------------------------------
-- Scenario 4: a collector cannot renew another collector's customer
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.renew_loan(
      '92000000-0000-0000-0000-000000000004',
      100, 10, 'daily', 3, current_date
    )
  $$,
  '42501',
  'Collector cannot renew loans for another portfolio',
  'Collector A cannot renew a loan belonging to Collector B''s customer'
);

reset role;

-- ------------------------------------------------------------
-- Scenario 5: an admin can renew any customer's loan
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000003';

select lives_ok(
  $$
    select * from public.renew_loan(
      '92000000-0000-0000-0000-000000000004',
      110, 10, 'daily', 3, current_date
    )
  $$,
  'An administrator can renew a loan belonging to any collector''s customer'
);

reset role;

select * from finish();

rollback;
