begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email)
values
  ('a1000000-0000-0000-0000-000000000001', 'loan.page.collector@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'loan.page.admin@test.local'),
  ('a1000000-0000-0000-0000-000000000003', 'loan.page.supervisor@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('a1000000-0000-0000-0000-000000000001', '71000001', 'Ángel Route Collector', 'collector', true),
  ('a1000000-0000-0000-0000-000000000002', '71000002', 'Loan Page Administrator', 'admin', true),
  ('a1000000-0000-0000-0000-000000000003', '71000003', 'Loan Page Supervisor', 'supervisor', true);

insert into public.customers (
  id, document_number, full_name, collector_id, created_by, active
)
values
  (
    'a2000000-0000-0000-0000-000000000001', '72000001', 'Álvaro Page Customer',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002', true
  ),
  (
    'a2000000-0000-0000-0000-000000000002', '72000002', 'Second Page Customer',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002', true
  ),
  (
    'a2000000-0000-0000-0000-000000000003', '72000003', 'Third Page Customer',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002', true
  );

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select public.admin_create_loan(
  'a2000000-0000-0000-0000-000000000001', 100, 10, 'daily', 3,
  '2026-11-02', '2026-11-03'
);
select public.admin_create_loan(
  'a2000000-0000-0000-0000-000000000002', 200, 10, 'weekly', 4,
  '2026-11-03', '2026-11-10'
);
select public.admin_create_loan(
  'a2000000-0000-0000-0000-000000000003', 300, 10, 'monthly', 5,
  '2026-11-04', '2026-12-04'
);

reset role;

select has_function(
  'public',
  'admin_list_loans_page',
  array['integer', 'integer', 'text', 'loan_status', 'uuid', 'loan_frequency'],
  'The paginated admin loan-list RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_list_loans_page(integer,integer,text,public.loan_status,uuid,public.loan_frequency)',
    'EXECUTE'
  ),
  'Anonymous callers cannot list paginated loans'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_list_loans_page(integer,integer,text,public.loan_status,uuid,public.loan_frequency)',
    'EXECUTE'
  ),
  'Authenticated callers may execute the RPC subject to authorization'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from public.admin_list_loans_page(0, 10, null, null, null, null) $$,
  '42501',
  'Only administrators or supervisors may list loans',
  'Collectors cannot list all loans'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from public.admin_list_loans_page(0, 2, null, null, null, null)),
  2::bigint,
  'The first page contains the requested number of loans'
);

select is(
  (select max(total_count) from public.admin_list_loans_page(0, 2, null, null, null, null)),
  3::bigint,
  'Every page reports the full filtered count'
);

select is(
  (select count(*) from public.admin_list_loans_page(1, 2, null, null, null, null)),
  1::bigint,
  'The second page contains only the remaining loan'
);

select is(
  (
    select count(*)
    from public.admin_list_loans_page(0, 10, 'alvaro', null, null, null)
  ),
  1::bigint,
  'Search is case- and accent-insensitive'
);

select is(
  (
    select count(*)
    from public.admin_list_loans_page(0, 10, null, 'active', null, 'weekly')
  ),
  1::bigint,
  'Status and frequency filters are applied on the server'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';

select is(
  (
    select count(*)
    from public.admin_list_loans_page(
      0, 10, null, null, 'a1000000-0000-0000-0000-000000000001', null
    )
    where installment_amount > 0
      and end_date is not null
      and balance = total_amount
  ),
  3::bigint,
  'Supervisors receive complete schedule and balance summaries'
);

select * from finish();
rollback;
