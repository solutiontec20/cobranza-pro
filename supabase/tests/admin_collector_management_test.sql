begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'collector.one@test.local'),
  ('10000000-0000-0000-0000-000000000002', 'collector.two@test.local'),
  ('10000000-0000-0000-0000-000000000003', 'supervisor@test.local'),
  ('10000000-0000-0000-0000-000000000004', 'admin@test.local'),
  ('10000000-0000-0000-0000-000000000005', 'new.collector@test.local');

insert into public.profiles (id, dni, full_name, phone, role, active)
values
  ('10000000-0000-0000-0000-000000000001', '10000001', 'Collector One', '911111111', 'collector', true),
  ('10000000-0000-0000-0000-000000000002', '10000002', 'Collector Two', null, 'collector', true),
  ('10000000-0000-0000-0000-000000000003', '10000003', 'Supervisor', null, 'supervisor', true),
  ('10000000-0000-0000-0000-000000000004', '10000004', 'Administrator', null, 'admin', true);

insert into public.customers (
  id,
  document_number,
  full_name,
  collector_id,
  created_by,
  active
)
values (
  '20000000-0000-0000-0000-000000000001',
  '70000001',
  'Assigned Customer',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000004',
  true
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from public.admin_list_collectors() $$,
  '42501',
  'COLLECTOR_LIST_FORBIDDEN',
  'Collectors cannot list the collector directory'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';

select results_eq(
  $$ select count(*) from public.admin_list_collectors() $$,
  array[2::bigint],
  'Supervisors can list collectors'
);

select throws_ok(
  $$
    select * from public.admin_create_collector_profile(
      '10000000-0000-0000-0000-000000000005',
      '10000005',
      'New Collector',
      '922222222'
    )
  $$,
  '42501',
  'COLLECTOR_CREATE_FORBIDDEN',
  'Supervisors cannot create collector profiles'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';

select results_eq(
  $$ select count(*) from public.admin_list_collectors() $$,
  array[2::bigint],
  'Administrators can list collectors'
);

select throws_ok(
  $$
    select * from public.admin_create_collector_profile(
      '10000000-0000-0000-0000-000000000005',
      '10000005',
      'New Collector',
      '822222222'
    )
  $$,
  '22023',
  'COLLECTOR_PHONE_INVALID',
  'Collector phone numbers must use the Peruvian mobile format'
);

select lives_ok(
  $$
    select * from public.admin_create_collector_profile(
      '10000000-0000-0000-0000-000000000005',
      '10000005',
      'New Collector',
      '922222222'
    )
  $$,
  'Administrators can create collector profiles'
);

reset role;

select results_eq(
  $$
    select role::text
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000005'
  $$,
  array['collector'::text],
  'Created profiles always have the collector role'
);

select results_eq(
  $$
    select actor_user_id
    from private.audit_log
    where table_name = 'profiles'
      and row_id = '10000000-0000-0000-0000-000000000005'
      and action = 'INSERT'
  $$,
  array['10000000-0000-0000-0000-000000000004'::uuid],
  'Profile creation records the administrator actor'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.admin_set_collector_active(
      '10000000-0000-0000-0000-000000000002',
      false,
      'Unauthorized change'
    )
  $$,
  '42501',
  'COLLECTOR_STATUS_FORBIDDEN',
  'Collectors cannot change another collector status'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';

select throws_ok(
  $$
    select * from public.admin_set_collector_active(
      '10000000-0000-0000-0000-000000000002',
      false,
      '   '
    )
  $$,
  '22023',
  'COLLECTOR_STATUS_REASON_REQUIRED',
  'Status changes require an audit reason'
);

select throws_ok(
  $$
    select * from public.admin_set_collector_active(
      '10000000-0000-0000-0000-000000000001',
      false,
      'Leaving the team'
    )
  $$,
  'P0001',
  'COLLECTOR_HAS_ACTIVE_CUSTOMERS',
  'A collector with active customers cannot be deactivated'
);

select lives_ok(
  $$
    select * from public.admin_set_collector_active(
      '10000000-0000-0000-0000-000000000002',
      false,
      'Temporary leave'
    )
  $$,
  'An administrator can deactivate a collector without active customers'
);

reset role;

select is(
  (select active from public.profiles where id = '10000000-0000-0000-0000-000000000002'),
  false,
  'The collector profile is inactive'
);

select results_eq(
  $$
    select reason
    from private.audit_log
    where table_name = 'profiles'
      and row_id = '10000000-0000-0000-0000-000000000002'
      and action = 'UPDATE'
    order by created_at desc
    limit 1
  $$,
  array['Temporary leave'::text],
  'Collector status changes preserve the audit reason'
);

select * from finish();

rollback;
