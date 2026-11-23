begin;

set local app.test_business_timestamp = '2026-11-23 12:00:00-05';

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email)
values
  ('a1000000-0000-0000-0000-000000000001', 'bulk.collector@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'bulk.admin@test.local'),
  ('a1000000-0000-0000-0000-000000000003', 'bulk.supervisor@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('a1000000-0000-0000-0000-000000000001', '94000001', 'Bulk Collector', 'collector', true),
  ('a1000000-0000-0000-0000-000000000002', '94000002', 'Bulk Administrator', 'admin', true),
  ('a1000000-0000-0000-0000-000000000003', '94000003', 'Bulk Supervisor', 'supervisor', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by)
values
  (
    'b1000000-0000-0000-0000-000000000001',
    '95000001',
    'Twenty Payment Customer',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    '95000002',
    'Atomic Rollback Customer',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    '95000003',
    'Other Loan Customer',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002'
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
values
  (
    'c1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    100,
    0,
    100,
    100,
    20,
    'daily',
    current_date,
    current_date + 1,
    'active',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000002',
    20,
    0,
    20,
    20,
    4,
    'daily',
    current_date,
    current_date + 1,
    'active',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'c1000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000003',
    10,
    0,
    10,
    10,
    2,
    'daily',
    current_date,
    current_date + 1,
    'active',
    'a1000000-0000-0000-0000-000000000002'
  );

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
select
  gen_random_uuid(),
  'c1000000-0000-0000-0000-000000000001'::uuid,
  installment_number,
  current_date + installment_number,
  5
from generate_series(1, 20) as schedule(installment_number);

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
select
  gen_random_uuid(),
  'c1000000-0000-0000-0000-000000000002'::uuid,
  installment_number,
  current_date + installment_number,
  5
from generate_series(1, 4) as schedule(installment_number);

insert into public.installments (id, loan_id, installment_number, due_date, scheduled_amount)
select
  gen_random_uuid(),
  'c1000000-0000-0000-0000-000000000003'::uuid,
  installment_number,
  current_date + installment_number,
  5
from generate_series(1, 2) as schedule(installment_number);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

do $block$
declare
  payment_number integer;
begin
  for payment_number in 1..20 loop
    perform public.register_payment(
      'c1000000-0000-0000-0000-000000000001',
      5,
      'cash',
      '2026-11-23 12:00:00-05'::timestamptz + make_interval(secs => payment_number),
      'Bulk payment ' || lpad(payment_number::text, 2, '0')
    );
  end loop;

  for payment_number in 1..2 loop
    perform public.register_payment(
      'c1000000-0000-0000-0000-000000000002',
      5,
      'cash',
      '2026-11-23 13:00:00-05'::timestamptz + make_interval(secs => payment_number),
      'Rollback payment ' || payment_number
    );
  end loop;

  perform public.register_payment(
    'c1000000-0000-0000-0000-000000000003',
    5,
    'cash',
    '2026-11-23 14:00:00-05'::timestamptz,
    'Other loan payment'
  );
end
$block$;

select has_function(
  'public',
  'void_payments_bulk',
  array['uuid', 'uuid[]', 'text'],
  'Bulk payment void RPC exists with an explicit loan boundary'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select *
    from public.void_payments_bulk(
      'c1000000-0000-0000-0000-000000000002',
      array[(select id from public.payments where notes = 'Rollback payment 1')],
      'Collector must not void payments'
    )
  $$,
  '42501',
  'Only administrators or supervisors may void payments',
  'Collectors cannot execute a bulk payment void'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select *
    from public.void_payments_bulk(
      'c1000000-0000-0000-0000-000000000002',
      array[
        (select id from public.payments where notes = 'Rollback payment 1'),
        (select id from public.payments where notes = 'Rollback payment 1')
      ],
      'Duplicate selection must fail'
    )
  $$,
  '22023',
  'Duplicate payment selection is not allowed',
  'Duplicate payment identifiers are rejected before any write'
);

select throws_ok(
  $$
    select *
    from public.void_payments_bulk(
      'c1000000-0000-0000-0000-000000000002',
      array[
        (select id from public.payments where notes = 'Rollback payment 1'),
        'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
      ],
      'Missing payment must roll back the batch'
    )
  $$,
  '22023',
  'All selected payments must belong to the loan and be posted',
  'An invalid payment rejects the complete batch'
);

select is(
  (
    select count(*)
    from public.payments
    where loan_id = 'c1000000-0000-0000-0000-000000000002'
      and status = 'posted'
  ),
  2::bigint,
  'A failed bulk operation leaves every valid payment posted'
);

select throws_ok(
  $$
    select *
    from public.void_payments_bulk(
      'c1000000-0000-0000-0000-000000000002',
      array[
        (select id from public.payments where notes = 'Rollback payment 1'),
        (select id from public.payments where notes = 'Other loan payment')
      ],
      'Cross-loan selection must fail'
    )
  $$,
  '22023',
  'All selected payments must belong to the loan and be posted',
  'Payments from another loan cannot be mixed into the batch'
);

select results_eq(
  $$
    select notes, status::text
    from public.payments
    where notes in ('Rollback payment 1', 'Other loan payment')
    order by notes
  $$,
  $$ values
    ('Other loan payment'::text, 'posted'::text),
    ('Rollback payment 1'::text, 'posted'::text)
  $$,
  'A rejected cross-loan batch changes neither payment'
);

create temporary table bulk_void_result (
  loan_id uuid,
  voided_count integer,
  voided_amount numeric(12,2),
  remaining_balance numeric(12,2)
) on commit drop;

select lives_ok(
  $$
    insert into bulk_void_result
    select *
    from public.void_payments_bulk(
      'c1000000-0000-0000-0000-000000000001',
      array(
        select id
        from public.payments
        where loan_id = 'c1000000-0000-0000-0000-000000000001'
          and status = 'posted'
        order by id
      ),
      'Twenty payments were entered against the wrong loan terms'
    )
  $$,
  'An administrator can void twenty posted payments atomically'
);

select results_eq(
  $$
    select loan_id, voided_count, voided_amount, remaining_balance
    from bulk_void_result
  $$,
  $$ values (
    'c1000000-0000-0000-0000-000000000001'::uuid,
    20,
    100.00::numeric,
    100.00::numeric
  ) $$,
  'The bulk RPC returns one summary for the selected loan'
);

select is(
  (
    select count(*)
    from public.payments
    where loan_id = 'c1000000-0000-0000-0000-000000000001'
      and status = 'voided'
  ),
  20::bigint,
  'All twenty payment records remain persisted as voided'
);

select is(
  (
    select count(*)
    from public.payments
    where loan_id = 'c1000000-0000-0000-0000-000000000001'
      and voided_by = 'a1000000-0000-0000-0000-000000000002'
      and void_reason = 'Twenty payments were entered against the wrong loan terms'
      and voided_at is not null
  ),
  20::bigint,
  'Every payment records the actor, timestamp, and shared audited reason'
);

select results_eq(
  $$
    select count(*), coalesce(sum(reversal.amount), 0)::numeric
    from public.cash_movements reversal
    join public.cash_movements original on original.id = reversal.reversal_of_id
    where original.loan_id = 'c1000000-0000-0000-0000-000000000001'
      and original.movement_type = 'collection'
      and reversal.movement_type = 'payment_void'
      and reversal.direction = 'outflow'
  $$,
  $$ values (20::bigint, 100.00::numeric) $$,
  'Each payment receives its own linked reverse cash movement'
);

select is(
  (
    select count(*)
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where p.loan_id = 'c1000000-0000-0000-0000-000000000001'
  ),
  20::bigint,
  'Payment allocations remain as immutable financial history'
);

select is(
  (
    select status::text
    from public.loans
    where id = 'c1000000-0000-0000-0000-000000000001'
  ),
  'active'::text,
  'Voiding the payments reopens the previously paid loan'
);

reset role;

select is(
  private.loan_outstanding('c1000000-0000-0000-0000-000000000001'),
  100.00::numeric,
  'The loan balance excludes every voided payment'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';

select lives_ok(
  $$
    select *
    from public.void_payments_bulk(
      'c1000000-0000-0000-0000-000000000003',
      array[(select id from public.payments where notes = 'Other loan payment')],
      'Supervisor confirmed the payment error'
    )
  $$,
  'A supervisor may execute a bulk payment void'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.void_payments_bulk(uuid,uuid[],text)', 'EXECUTE'),
  'Anonymous users cannot execute the bulk payment void RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.void_payments_bulk(uuid,uuid[],text)', 'EXECUTE'),
  'Authenticated application users receive RPC access for the internal role check'
);

select * from finish();

rollback;
