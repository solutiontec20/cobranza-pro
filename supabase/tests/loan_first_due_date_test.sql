begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email)
values
  ('a1000000-0000-0000-0000-000000000001', 'first-due-admin@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'first-due-collector@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('a1000000-0000-0000-0000-000000000001', '89100001', 'First Due Admin', 'admin', true),
  ('a1000000-0000-0000-0000-000000000002', '89100002', 'First Due Collector', 'collector', true);

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
    'a2000000-0000-0000-0000-000000000001',
    '89200001',
    'Admin Loan Customer',
    'Test address',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    '89200002',
    'Collector Existing Customer',
    'Test address',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001'
  );

select has_function(
  'private',
  'loan_installment_due_on',
  array['date', 'loan_frequency', 'integer'],
  'Central installment due-date helper exists'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'loans'
      and t.tgname = 'loans_enforce_first_due_on'
      and not t.tgisinternal
  ),
  'Loans enforce the central first due date'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'installments'
      and t.tgname = 'installments_enforce_due_on'
      and not t.tgisinternal
  ),
  'Installments enforce the central schedule rule'
);

select is(
  private.loan_installment_due_on('2026-10-31', 'daily', 1),
  '2026-11-02'::date,
  'A daily loan disbursed Saturday starts collection Monday'
);

select is(
  private.loan_installment_due_on('2026-10-31', 'weekly', 1),
  '2026-11-07'::date,
  'A weekly loan starts exactly seven days after disbursement'
);

select is(
  private.loan_installment_due_on('2026-10-01', 'monthly', 1),
  '2026-11-02'::date,
  'A monthly Sunday due date moves to Monday within the same month'
);

select is(
  private.loan_installment_due_on('2026-12-31', 'monthly', 1),
  '2027-01-30'::date,
  'A month-end Sunday due date moves back to Saturday'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.loan_installment_due_on(date,public.loan_frequency,integer)',
    'EXECUTE'
  ),
  'Application callers cannot execute the private due-date helper directly'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.admin_create_loan(
      'a2000000-0000-0000-0000-000000000001',
      100, 10, 'daily', 3, '2026-10-31', '2026-10-31'
    )
  $$,
  'Admin creation accepts the existing signature and centralizes schedule dates'
);

reset role;

select is(
  (
    select l.first_due_on
    from public.loans l
    where l.customer_id = 'a2000000-0000-0000-0000-000000000001'
      and l.status = 'active'
  ),
  '2026-11-02'::date,
  'Admin-created loan stores the first collectible day after disbursement'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.customer_id = 'a2000000-0000-0000-0000-000000000001'
      and i.superseded_at is null
    order by i.installment_number
  $$,
  array['2026-11-02'::date, '2026-11-03'::date, '2026-11-04'::date],
  'Admin-created daily schedule skips Sunday and starts after disbursement'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.admin_update_loan(
      (
        select l.id
        from public.loans l
        where l.customer_id = 'a2000000-0000-0000-0000-000000000001'
          and l.status = 'active'
      ),
      100, 10, 'weekly', 3, '2026-10-31', 'Verify centralized first due date'
    )
  $$,
  'Admin updates use the same schema-boundary schedule rule'
);

reset role;

select is(
  (
    select l.first_due_on
    from public.loans l
    where l.customer_id = 'a2000000-0000-0000-0000-000000000001'
      and l.status = 'active'
  ),
  '2026-11-07'::date,
  'Admin-updated weekly loan starts seven days later'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.customer_id = 'a2000000-0000-0000-0000-000000000001'
      and i.superseded_at is null
    order by i.installment_number
  $$,
  array['2026-11-07'::date, '2026-11-14'::date, '2026-11-21'::date],
  'Admin update rebuilds the weekly schedule from the centralized rule'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.collector_create_customer_loan(
      '89200003', 'Collector New Customer', null, 'Test address', null,
      120, 0, 'monthly', 2, '2026-10-01'
    )
  $$,
  'Collector customer-plus-loan creation uses the central schedule boundary'
);

reset role;

select is(
  (
    select l.first_due_on
    from public.loans l
    join public.customers c on c.id = l.customer_id
    where c.document_number = '89200003'
  ),
  '2026-11-02'::date,
  'Collector customer-plus-loan monthly first due date adjusts Sunday'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    join public.customers c on c.id = l.customer_id
    where c.document_number = '89200003'
    order by i.installment_number
  $$,
  array['2026-11-02'::date, '2026-12-01'::date],
  'Collector customer-plus-loan monthly schedule uses each target month'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.collector_create_loan(
      'a2000000-0000-0000-0000-000000000002',
      100, 10, 'weekly', 3, current_date + 60
    )
  $$,
  'Collector creation for an existing customer uses the central rule'
);

reset role;

select is(
  (
    select l.first_due_on
    from public.loans l
    where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
      and l.status = 'active'
  ),
  current_date + 67,
  'Collector-created weekly loan starts seven days after disbursement'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
      and i.superseded_at is null
    order by i.installment_number
  $$,
  array[current_date + 67, current_date + 74, current_date + 81],
  'Collector-created weekly installments remain seven days apart'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.renew_loan(
      (
        select l.id
        from public.loans l
        where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
          and l.status = 'active'
      ),
      110, 0, 'daily', 3, current_date + 90
    )
  $$,
  'Loan renewal creates its replacement schedule through the central boundary'
);

reset role;

select is(
  (
    select l.first_due_on
    from public.loans l
    where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
      and l.status = 'active'
  ),
  private.loan_first_due_on(current_date + 90, 'daily'),
  'Renewed loan starts on the next collectible day'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
      and l.status = 'active'
      and i.superseded_at is null
    order by i.installment_number
  $$,
  array[
    private.loan_installment_due_on(current_date + 90, 'daily', 1),
    private.loan_installment_due_on(current_date + 90, 'daily', 2),
    private.loan_installment_due_on(current_date + 90, 'daily', 3)
  ],
  'Renewed daily schedule follows the same Monday-through-Saturday calendar'
);

insert into public.payments (
  loan_id,
  collector_id,
  amount,
  payment_method,
  business_date,
  status,
  created_by
)
select
  l.id,
  c.collector_id,
  10,
  'cash',
  current_date,
  'posted',
  c.collector_id
from public.loans l
join public.customers c on c.id = l.customer_id
where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
  and l.status = 'active';

insert into public.payment_allocations (payment_id, installment_id, amount)
select p.id, i.id, 10
from public.payments p
join public.loans l on l.id = p.loan_id
join public.installments i on i.loan_id = l.id and i.installment_number = 1
where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
  and l.status = 'active'
  and i.superseded_at is null;

create temp table due_repair_identity as
select
  l.id as loan_id,
  array_agg(i.id order by i.installment_number) as installment_ids,
  min(p.id::text)::uuid as payment_id,
  min(pa.id::text)::uuid as allocation_id,
  min(pa.installment_id::text)::uuid as allocated_installment_id
from public.loans l
join public.installments i on i.loan_id = l.id and i.superseded_at is null
join public.payments p on p.loan_id = l.id
join public.payment_allocations pa on pa.payment_id = p.id and pa.superseded_at is null
where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
  and l.status = 'active'
group by l.id;

alter table public.loans disable trigger loans_enforce_first_due_on;
alter table public.installments disable trigger installments_enforce_due_on;

select set_config('app.audit_reason', '', true);

update public.loans l
set first_due_on = l.started_on
where l.id = (select loan_id from due_repair_identity);

update public.installments i
set due_date = l.started_on + 100 + i.installment_number
from public.loans l
where l.id = i.loan_id
  and l.id = (select loan_id from due_repair_identity)
  and i.superseded_at is null;

alter table public.loans enable trigger loans_enforce_first_due_on;
alter table public.installments enable trigger installments_enforce_due_on;

select ok(
  private.repair_active_loan_due_dates() >= 4,
  'Repair corrects the loan and every active installment in place'
);

select is(
  (
    select l.id
    from public.loans l
    where l.customer_id = 'a2000000-0000-0000-0000-000000000002'
      and l.status = 'active'
  ),
  (select loan_id from due_repair_identity),
  'Repair preserves the active loan identity'
);

select is(
  (
    select array_agg(i.id order by i.installment_number)
    from public.installments i
    where i.loan_id = (select loan_id from due_repair_identity)
      and i.superseded_at is null
  ),
  (select installment_ids from due_repair_identity),
  'Repair preserves installment identities'
);

select results_eq(
  $$
    select pa.id, pa.payment_id, pa.installment_id
    from public.payment_allocations pa
    where pa.id = (select allocation_id from due_repair_identity)
  $$,
  $$
    select allocation_id, payment_id, allocated_installment_id
    from due_repair_identity
  $$,
  'Repair preserves the payment allocation identity and relationship'
);

select results_eq(
  $$
    select i.due_date
    from public.installments i
    join public.loans l on l.id = i.loan_id
    where i.loan_id = (select loan_id from due_repair_identity)
      and i.superseded_at is null
    order by i.installment_number
  $$,
  array[
    private.loan_installment_due_on(current_date + 90, 'daily', 1),
    private.loan_installment_due_on(current_date + 90, 'daily', 2),
    private.loan_installment_due_on(current_date + 90, 'daily', 3)
  ],
  'Repair restores every active installment due date'
);

select is(
  (
    select count(*)
    from private.audit_log al
    where al.reason = 'Automatic repair: first installment must follow disbursement'
      and (
        al.row_id = (select loan_id from due_repair_identity)
        or al.row_id in (
          select unnest(installment_ids)
          from due_repair_identity
        )
      )
  ),
  4::bigint,
  'Repair records the loan and installment changes in the audit trail'
);

select * from finish();

rollback;
