begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email)
values
  ('b1000000-0000-0000-0000-000000000001', 'client.page.collector@test.local'),
  ('b1000000-0000-0000-0000-000000000002', 'client.page.admin@test.local'),
  ('b1000000-0000-0000-0000-000000000003', 'client.page.supervisor@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('b1000000-0000-0000-0000-000000000001', '73000001', 'Client Page Collector', 'collector', true),
  ('b1000000-0000-0000-0000-000000000002', '73000002', 'Client Page Administrator', 'admin', true),
  ('b1000000-0000-0000-0000-000000000003', '73000003', 'Client Page Supervisor', 'supervisor', true);

insert into public.customers (
  id, document_number, full_name, collector_id, created_by, active
)
values
  (
    'b2000000-0000-0000-0000-000000000001', '74000001', 'Álvaro Client Page',
    'b1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002', true
  ),
  (
    'b2000000-0000-0000-0000-000000000002', '74000002', 'Second Client Page',
    'b1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002', true
  ),
  (
    'b2000000-0000-0000-0000-000000000003', '74000003', 'Third Client Page',
    'b1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002', true
  );

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';

select public.admin_create_loan(
  'b2000000-0000-0000-0000-000000000001', 100, 10, 'daily', 3,
  '2026-11-02', '2026-11-03'
);

reset role;

select has_function(
  'public',
  'admin_list_clients_page',
  array['integer', 'integer', 'text', 'uuid'],
  'The paginated admin client-list RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_list_clients_page(integer,integer,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous callers cannot list paginated clients'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_list_clients_page(integer,integer,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated callers may execute the RPC subject to authorization'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from public.admin_list_clients_page(0, 10, null, null) $$,
  '42501',
  'Only administrators or supervisors may list clients',
  'Collectors cannot list all clients'
);

set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';

select is(
  (
    select count(*)
    from public.admin_list_clients_page(
      0, 2, null, 'b1000000-0000-0000-0000-000000000001'
    )
  ),
  2::bigint,
  'The first page contains the requested number of clients'
);

select is(
  (
    select max(total_count)
    from public.admin_list_clients_page(
      0, 2, null, 'b1000000-0000-0000-0000-000000000001'
    )
  ),
  3::bigint,
  'Every page reports the full filtered client count'
);

select is(
  (
    select count(*)
    from public.admin_list_clients_page(
      1, 2, null, 'b1000000-0000-0000-0000-000000000001'
    )
  ),
  1::bigint,
  'The second page contains only the remaining client'
);

select results_eq(
  $$
    select count(*)::bigint, max(total_count)
    from public.admin_list_clients_page(
      10, 2, null, 'b1000000-0000-0000-0000-000000000001'
    )
  $$,
  $$ values (1::bigint, 3::bigint) $$,
  'An empty page preserves the full filtered client count'
);

select is(
  (
    select count(*)
    from public.admin_list_clients_page(
      0, 10, '74000001', 'b1000000-0000-0000-0000-000000000001'
    )
  ),
  1::bigint,
  'DNI search is applied on the server'
);

select is(
  (
    select count(*)
    from public.admin_list_clients_page(
      0, 10, 'Álvaro', 'b1000000-0000-0000-0000-000000000001'
    )
  ),
  1::bigint,
  'Name search is applied on the server'
);

set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003';

select results_eq(
  $$
    select outstanding_amount, is_blacklisted
    from public.admin_list_clients_page(
      0, 10, '74000001', 'b1000000-0000-0000-0000-000000000001'
    )
  $$,
  $$ values (110.00::numeric, true) $$,
  'Supervisors receive the page-scoped financial summary'
);

select * from finish();
rollback;
