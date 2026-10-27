begin;

set local timezone to 'America/Lima';

create extension if not exists pgtap with schema extensions;

select plan(6);

-- ============================================================
-- REQUERIMIENTO.md section 6 ("Clientes atrasados y lista negra"):
--
-- "Cuando un cliente acumula mas de 5 dias de atraso, el sistema
-- lo pasa solo a la lista negra. No hay que hacer nada a mano."
-- "Cuando el cliente se pone al dia, sale solo de la lista negra."
--
-- public.customer_financial_status (20261007021233_initial_schema.sql)
-- derives is_blacklisted purely from
-- coalesce(max(installment_balances.overdue_days), 0) > 5 -- no
-- stored flag exists, so both entering and exiting the blacklist
-- are implicit side effects of overdue_days changing. This file
-- locks in the ">5" boundary (5 days overdue is NOT blacklisted,
-- 6 days IS) and the auto-exit once the overdue installment is
-- caught up while the loan stays active.
--
-- Due dates are relative to current_date in America/Lima rather than hardcoded,
-- because overdue_days is computed live against
-- (now() at time zone 'America/Lima')::date.
-- ============================================================

insert into auth.users (id, email)
values
  ('70000000-0000-0000-0000-000000000001', 'blacklist.admin@test.local'),
  ('70000000-0000-0000-0000-000000000002', 'blacklist.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('70000000-0000-0000-0000-000000000001', '70000001', 'Blacklist Admin', 'admin', true),
  ('70000000-0000-0000-0000-000000000002', '70000002', 'Blacklist Collector', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values
  (
    '80000000-0000-0000-0000-000000000001',
    '80000001',
    'No Loan Customer',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '80000002',
    'Mild Overdue Customer',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '80000003',
    'Boundary Overdue Customer',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '80000000-0000-0000-0000-000000000004',
    '80000004',
    'Blacklisted Customer',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    true
  );

-- Customer 2: mild overdue, 3 days, unpaid, single installment.
-- Customer 3: exactly 5 days overdue (the ">5" boundary), unpaid.
-- Customer 4: 6 days overdue on its first installment (blacklisted),
-- with a second installment that is not due yet, so paying off the
-- overdue one can later demonstrate auto-exit without the loan
-- itself closing.

insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values
  (
    '80000000-1111-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000002',
    100.00, 20.0000, 120.00, 100.00, 1, 'daily',
    current_date - 3, current_date - 3, 'active',
    '70000000-0000-0000-0000-000000000001'
  ),
  (
    '80000000-1111-0000-0000-000000000003',
    '80000000-0000-0000-0000-000000000003',
    100.00, 20.0000, 120.00, 100.00, 1, 'daily',
    current_date - 5, current_date - 5, 'active',
    '70000000-0000-0000-0000-000000000001'
  ),
  (
    '80000000-1111-0000-0000-000000000004',
    '80000000-0000-0000-0000-000000000004',
    100.00, 20.0000, 120.00, 100.00, 2, 'daily',
    current_date - 6, current_date - 6, 'active',
    '70000000-0000-0000-0000-000000000001'
  );

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
values
  (
    '80000000-2222-0000-0000-000000000002',
    '80000000-1111-0000-0000-000000000002',
    1, current_date - 3, 120.00
  ),
  (
    '80000000-2222-0000-0000-000000000003',
    '80000000-1111-0000-0000-000000000003',
    1, current_date - 5, 120.00
  ),
  (
    '80000000-2222-0000-0000-000000000004',
    '80000000-1111-0000-0000-000000000004',
    1, current_date - 6, 60.00
  ),
  (
    '80000000-2222-0000-0000-000000000005',
    '80000000-1111-0000-0000-000000000004',
    2, current_date + 1, 60.00
  );

-- ============================================================
-- AUTHENTICATE AS ADMIN
-- (admin/supervisor can see every customer's financial status)
-- ============================================================

set local role authenticated;
set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';

-- ============================================================
-- TEST 1
-- A customer without any active loan is never blacklisted.
-- ============================================================

select results_eq(
  $$
    select is_blacklisted, max_overdue_days
    from public.customer_financial_status
    where customer_id = '80000000-0000-0000-0000-000000000001'
  $$,
  $$ values (false, 0) $$,
  'A customer with no active loan is never blacklisted'
);

-- ============================================================
-- TEST 2
-- 3 days overdue: not blacklisted yet.
-- ============================================================

select results_eq(
  $$
    select is_blacklisted, max_overdue_days
    from public.customer_financial_status
    where customer_id = '80000000-0000-0000-0000-000000000002'
  $$,
  $$ values (false, 3) $$,
  'A customer 3 days overdue is not blacklisted'
);

-- ============================================================
-- TEST 3
-- Exactly 5 days overdue: the rule is "more than 5 days", so
-- this boundary must still NOT be blacklisted.
-- ============================================================

select results_eq(
  $$
    select is_blacklisted, max_overdue_days
    from public.customer_financial_status
    where customer_id = '80000000-0000-0000-0000-000000000003'
  $$,
  $$ values (false, 5) $$,
  'A customer exactly 5 days overdue is not yet blacklisted'
);

-- ============================================================
-- TEST 4
-- 6 days overdue: blacklisted automatically, no manual flag.
-- ============================================================

select results_eq(
  $$
    select is_blacklisted, max_overdue_days
    from public.customer_financial_status
    where customer_id = '80000000-0000-0000-0000-000000000004'
  $$,
  $$ values (true, 6) $$,
  'A customer more than 5 days overdue is automatically blacklisted'
);

-- ============================================================
-- TEST 5
-- Catching up on the overdue installment (admin pays on the
-- customer's behalf) is accepted while the loan stays active,
-- since a future installment is still pending.
-- ============================================================

select lives_ok(
  $$
    select * from public.register_payment(
      '80000000-1111-0000-0000-000000000004'::uuid,
      60.00,
      'cash',
      now(),
      'Pago para salir de lista negra (test)'
    )
  $$,
  'Admin can pay off the overdue installment on the blacklisted customer behalf'
);

-- ============================================================
-- TEST 6
-- Once caught up, the customer leaves the blacklist automatically
-- ("sale solo"), with no manual action beyond registering the
-- payment.
-- ============================================================

select results_eq(
  $$
    select is_blacklisted, max_overdue_days
    from public.customer_financial_status
    where customer_id = '80000000-0000-0000-0000-000000000004'
  $$,
  $$ values (false, 0) $$,
  'Catching up on the overdue installment automatically clears the blacklist'
);

select * from finish();

rollback;
