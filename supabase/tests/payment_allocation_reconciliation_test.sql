begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email)
values
  ('53000000-0000-0000-0000-000000000001', 'allocation.repair.collector@test.local'),
  ('53000000-0000-0000-0000-000000000002', 'allocation.repair.admin@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  (
    '53000000-0000-0000-0000-000000000001',
    '53000001',
    'Allocation Repair Collector',
    'collector',
    true
  ),
  (
    '53000000-0000-0000-0000-000000000002',
    '53000002',
    'Allocation Repair Administrator',
    'admin',
    true
  );

insert into public.customers (
  id,
  document_number,
  full_name,
  collector_id,
  created_by,
  active
)
values (
  '63000000-0000-0000-0000-000000000001',
  '63000001',
  'Incomplete Allocation Customer',
  '53000000-0000-0000-0000-000000000001',
  '53000000-0000-0000-0000-000000000002',
  true
);

insert into public.loans (
  id,
  customer_id,
  principal_amount,
  interest_rate_percent,
  total_amount,
  disbursed_amount,
  installment_count,
  frequency,
  started_on,
  first_due_on,
  status,
  created_by
)
values (
  '73000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001',
  120,
  0,
  120,
  120,
  30,
  'daily',
  '2026-10-20',
  '2026-10-20',
  'active',
  '53000000-0000-0000-0000-000000000002'
);

insert into public.installments (
  id,
  loan_id,
  installment_number,
  due_date,
  scheduled_amount
)
select
  ('83000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  '73000000-0000-0000-0000-000000000001'::uuid,
  series,
  '2026-10-20'::date + series - 1,
  4
from generate_series(1, 30) as series;

insert into public.payments (
  id,
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
  ('93000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  '73000000-0000-0000-0000-000000000001'::uuid,
  '53000000-0000-0000-0000-000000000001'::uuid,
  case when series = 8 then 1 else 4 end,
  'cash',
  '2026-10-20 12:00:00+00'::timestamptz + make_interval(mins => series),
  '2026-10-20'::date,
  'posted',
  '53000000-0000-0000-0000-000000000002'::uuid
from generate_series(1, 8) as series;

insert into public.payment_allocations (
  id,
  payment_id,
  installment_id,
  amount
)
values
  (
    'a3000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    4
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000008',
    '83000000-0000-0000-0000-000000000002',
    1
  );

select ok(
  not has_function_privilege(
    'authenticated',
    'private.repair_incomplete_payment_allocations()',
    'EXECUTE'
  ),
  'Authenticated callers cannot execute the internal allocation repair'
);

select results_eq(
  $$
    select
      count(*) filter (where status = 'paid'),
      count(*) filter (where status = 'partial')
    from public.installment_balances
    where loan_id = '73000000-0000-0000-0000-000000000001'
  $$,
  $$ values (1::bigint, 1::bigint) $$,
  'The inconsistent fixture reproduces one paid installment and one partial installment'
);

select is(
  private.repair_incomplete_payment_allocations(),
  1,
  'One loan with incomplete allocations is repaired'
);

select results_eq(
  $$
    select
      count(*) filter (where status = 'paid'),
      count(*) filter (where status = 'partial')
    from public.installment_balances
    where loan_id = '73000000-0000-0000-0000-000000000001'
  $$,
  $$ values (7::bigint, 1::bigint) $$,
  'Seven full payments and one partial payment are reflected in the schedule'
);

select results_eq(
  $$
    select paid_amount, outstanding_amount, status
    from public.installment_balances
    where loan_id = '73000000-0000-0000-0000-000000000001'
      and installment_number = 8
  $$,
  $$ values (1.00::numeric, 3.00::numeric, 'partial'::text) $$,
  'The eighth installment keeps the one-sol partial payment and three-sol remainder'
);

select is(
  (
    select sum(pa.amount)
    from public.payment_allocations pa
    join public.payments p
      on p.id = pa.payment_id
    where p.loan_id = '73000000-0000-0000-0000-000000000001'
      and p.status = 'posted'
      and pa.superseded_at is null
  ),
  29.00::numeric,
  'Active allocations reconcile to every posted payment'
);

select is(
  (
    select count(*)
    from public.payments p
    where p.loan_id = '73000000-0000-0000-0000-000000000001'
      and p.status = 'posted'
      and p.amount = (
        select coalesce(sum(pa.amount), 0)
        from public.payment_allocations pa
        where pa.payment_id = p.id
          and pa.superseded_at is null
      )
  ),
  8::bigint,
  'Every posted payment is fully allocated after reconciliation'
);

select is(
  (
    select count(*)
    from public.payment_allocations
    where id in (
      'a3000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000002'
    )
      and superseded_at is not null
      and supersession_reason = 'Rebuilt from complete posted payment history'
  ),
  2::bigint,
  'Original inconsistent allocations remain as superseded audit evidence'
);

select is(
  (
    select count(*)
    from public.payments
    where loan_id = '73000000-0000-0000-0000-000000000001'
  ),
  8::bigint,
  'Reconciliation preserves every payment record'
);

select is(
  private.repair_incomplete_payment_allocations(),
  0,
  'A second reconciliation run is idempotent'
);

select * from finish();

rollback;
