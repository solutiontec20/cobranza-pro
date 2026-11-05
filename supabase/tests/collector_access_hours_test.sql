begin;

set local app.test_business_timestamp = '2026-11-05 12:00:00-05';

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email)
values
  ('ac000000-0000-0000-0000-000000000001', 'hours.admin@test.local'),
  ('ac000000-0000-0000-0000-000000000002', 'hours.supervisor@test.local'),
  ('ac000000-0000-0000-0000-000000000003', 'hours.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('ac000000-0000-0000-0000-000000000001', '92000001', 'Hours Admin', 'admin', true),
  ('ac000000-0000-0000-0000-000000000002', '92000002', 'Hours Supervisor', 'supervisor', true),
  ('ac000000-0000-0000-0000-000000000003', '92000003', 'Hours Collector', 'collector', true);

insert into public.customers (
  id,
  document_number,
  full_name,
  collector_id,
  created_by,
  active
)
values (
  'ac100000-0000-0000-0000-000000000001',
  '92000004',
  'Hours Customer',
  'ac000000-0000-0000-0000-000000000003',
  'ac000000-0000-0000-0000-000000000001',
  true
);

-- The pure boundary helper documents the exact inclusive/exclusive behavior.
select is(
  private.collector_access_is_open('2026-11-05 06:59:59-05'::timestamptz),
  false,
  'Collector access is closed one second before 07:00 in Lima'
);

select is(
  private.collector_access_is_open('2026-11-05 07:00:00-05'::timestamptz),
  true,
  'Collector access opens exactly at 07:00 in Lima'
);

select is(
  private.collector_access_is_open('2026-11-05 19:59:59-05'::timestamptz),
  true,
  'Collector access remains open one second before 20:00 in Lima'
);

select is(
  private.collector_access_is_open('2026-11-05 20:00:00-05'::timestamptz),
  false,
  'Collector access closes exactly at 20:00 in Lima'
);

select ok(
  not has_function_privilege('anon', 'public.current_access_status()', 'EXECUTE'),
  'Anonymous callers cannot inspect an access status'
);

select ok(
  has_function_privilege('authenticated', 'public.current_access_status()', 'EXECUTE'),
  'Authenticated callers can inspect their own access status'
);

set local role authenticated;
set local request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000003';

set local app.test_business_timestamp = '2026-11-05 06:59:59-05';

select is(
  (select private.current_app_role()),
  null::public.app_role,
  'A collector has no application role before 07:00'
);

set local app.test_business_timestamp = '2026-11-05 07:00:00-05';

select is(
  (select private.current_app_role()),
  'collector'::public.app_role,
  'A collector receives their application role at 07:00'
);

set local app.test_business_timestamp = '2026-11-05 19:59:59-05';

select is(
  (select private.current_app_role()),
  'collector'::public.app_role,
  'A collector keeps their application role before 20:00'
);

select results_eq(
  $$
    select count(*)
    from public.customers
    where id = 'ac100000-0000-0000-0000-000000000001'
  $$,
  array[1::bigint],
  'An active collector session can read its portfolio during business hours'
);

set local app.test_business_timestamp = '2026-11-05 20:00:00-05';

select is(
  (select private.current_app_role()),
  null::public.app_role,
  'A collector loses their application role exactly at 20:00'
);

select results_eq(
  $$
    select count(*)
    from public.customers
    where id = 'ac100000-0000-0000-0000-000000000001'
  $$,
  array[0::bigint],
  'An already-open collector session loses portfolio access at 20:00'
);

select results_eq(
  $$
    select allowed, role, server_now, opens_at, closes_at
    from public.current_access_status()
  $$,
  $$ values (
    false,
    'collector'::public.app_role,
    '2026-11-06 01:00:00+00'::timestamptz,
    '2026-11-05 12:00:00+00'::timestamptz,
    '2026-11-06 01:00:00+00'::timestamptz
  ) $$,
  'Access status uses the authoritative server clock and Lima boundaries'
);

set local request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000001';
set local app.test_business_timestamp = '2026-11-05 23:30:00-05';

select is(
  (select private.current_app_role()),
  'admin'::public.app_role,
  'Administrators retain access outside collector business hours'
);

set local request.jwt.claim.sub = 'ac000000-0000-0000-0000-000000000002';
set local app.test_business_timestamp = '2026-11-05 02:30:00-05';

select is(
  (select private.current_app_role()),
  'supervisor'::public.app_role,
  'Supervisors retain access outside collector business hours'
);

select * from finish();

rollback;
