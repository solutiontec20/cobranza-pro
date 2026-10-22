begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email)
values
  ('52000000-0000-0000-0000-000000000001', 'schedule.repair.collector@test.local'),
  ('52000000-0000-0000-0000-000000000002', 'schedule.repair.admin@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  (
    '52000000-0000-0000-0000-000000000001',
    '52000001',
    'Schedule Repair Collector',
    'collector',
    true
  ),
  (
    '52000000-0000-0000-0000-000000000002',
    '52000002',
    'Schedule Repair Administrator',
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
  '62000000-0000-0000-0000-000000000001',
  '62000001',
  'Legacy Schedule Customer',
  '52000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000002',
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
  '72000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  32,
  0,
  32,
  32,
  8,
  'daily',
  '2026-12-21',
  '2026-12-21',
  'active',
  '52000000-0000-0000-0000-000000000002'
);

insert into public.installments (
  id,
  loan_id,
  installment_number,
  due_date,
  scheduled_amount
)
values
  ('82000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 1, '2026-12-21', 4),
  ('82000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 2, '2026-12-22', 4),
  ('82000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 3, '2026-12-23', 4),
  ('82000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000001', 4, '2026-12-24', 4),
  ('82000000-0000-0000-0000-000000000005', '72000000-0000-0000-0000-000000000001', 5, '2026-12-25', 4),
  ('82000000-0000-0000-0000-000000000006', '72000000-0000-0000-0000-000000000001', 6, '2026-12-28', 4),
  ('82000000-0000-0000-0000-000000000007', '72000000-0000-0000-0000-000000000001', 7, '2026-12-29', 4),
  ('82000000-0000-0000-0000-000000000008', '72000000-0000-0000-0000-000000000001', 8, '2026-12-30', 4);

create temporary table expected_installment_identity
on commit drop
as
select id, installment_number, scheduled_amount
from public.installments
where loan_id = '72000000-0000-0000-0000-000000000001';

insert into public.payments (
  id,
  loan_id,
  collector_id,
  amount,
  payment_method,
  business_date,
  status,
  created_by
)
values (
  '92000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  4,
  'cash',
  '2026-12-21',
  'posted',
  '52000000-0000-0000-0000-000000000002'
);

insert into public.payment_allocations (
  id,
  payment_id,
  installment_id,
  amount
)
values (
  'a2000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  4
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.repair_active_daily_loan_schedules()',
    'EXECUTE'
  ),
  'Authenticated callers cannot execute the internal schedule repair'
);

select is(
  private.repair_active_daily_loan_schedules(),
  1,
  'One legacy active daily schedule is repaired'
);

select results_eq(
  $$
    select due_date
    from public.installments
    where loan_id = '72000000-0000-0000-0000-000000000001'
      and superseded_at is null
    order by installment_number
  $$,
  array[
    '2026-12-21'::date,
    '2026-12-22'::date,
    '2026-12-23'::date,
    '2026-12-24'::date,
    '2026-12-25'::date,
    '2026-12-26'::date,
    '2026-12-28'::date,
    '2026-12-29'::date
  ],
  'The repaired schedule includes the weekday holiday and Saturday'
);

select is(
  (
    select count(*)
    from public.installments
    where loan_id = '72000000-0000-0000-0000-000000000001'
      and extract(isodow from due_date) = 6
  ),
  1::bigint,
  'Saturday remains a collection day'
);

select is(
  (
    select count(*)
    from public.installments
    where loan_id = '72000000-0000-0000-0000-000000000001'
      and extract(isodow from due_date) = 7
  ),
  0::bigint,
  'Sunday remains excluded'
);

select results_eq(
  $$
    select i.id, i.installment_number, i.scheduled_amount
    from public.installments i
    where i.loan_id = '72000000-0000-0000-0000-000000000001'
    order by i.installment_number
  $$,
  $$
    select e.id, e.installment_number, e.scheduled_amount
    from expected_installment_identity e
    order by e.installment_number
  $$,
  'Installment identities, numbers, and amounts remain unchanged'
);

select is(
  (
    select installment_id
    from public.payment_allocations
    where id = 'a2000000-0000-0000-0000-000000000001'
  ),
  '82000000-0000-0000-0000-000000000001'::uuid,
  'Existing payment allocations keep their installment reference'
);

select results_eq(
  $$
    select reason, old_data ->> 'due_date', new_data ->> 'due_date'
    from private.audit_log
    where table_name = 'installments'
      and row_id = '82000000-0000-0000-0000-000000000006'
    order by id desc
    limit 1
  $$,
  $$
    values (
      'Correct daily schedule to collect Monday through Saturday'::text,
      '2026-12-28'::text,
      '2026-12-26'::text
    )
  $$,
  'The corrected due date is audit logged with its reason'
);

select is(
  private.repair_active_daily_loan_schedules(),
  0,
  'The repair is idempotent for an already-correct schedule'
);

select is(
  (
    select count(*)
    from private.audit_log
    where table_name = 'installments'
      and row_id = '82000000-0000-0000-0000-000000000006'
  ),
  1::bigint,
  'An idempotent rerun creates no duplicate audit row'
);

select * from finish();

rollback;
