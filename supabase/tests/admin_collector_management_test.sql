begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

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

select is(
  (select must_change_pin from public.profiles where id = '10000000-0000-0000-0000-000000000005'),
  true,
  'New collectors must replace their temporary PIN'
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

select ok(
  not has_function_privilege(
    'authenticated',
    'public.service_complete_collector_pin_change(uuid)',
    'EXECUTE'
  ),
  'Authenticated users cannot complete PIN changes directly'
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

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.admin_prepare_collector_pin_reset(
      '10000000-0000-0000-0000-000000000001',
      'Forgotten PIN'
    )
  $$,
  '42501',
  'COLLECTOR_PIN_RESET_FORBIDDEN',
  'Collectors cannot prepare their own administrative reset'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';

select throws_ok(
  $$
    select * from public.admin_prepare_collector_pin_reset(
      '10000000-0000-0000-0000-000000000001',
      '   '
    )
  $$,
  '22023',
  'COLLECTOR_PIN_RESET_REASON_INVALID',
  'PIN resets require an audit reason'
);

select lives_ok(
  $$
    select * from public.admin_prepare_collector_pin_reset(
      '10000000-0000-0000-0000-000000000001',
      'Collector forgot the PIN'
    )
  $$,
  'Administrators can prepare an active collector PIN reset'
);

reset role;

select is(
  (select must_change_pin from public.profiles where id = '10000000-0000-0000-0000-000000000001'),
  true,
  'A reset marks the PIN as temporary'
);

select ok(
  (select credentials_invalid_before is not null from public.profiles where id = '10000000-0000-0000-0000-000000000001'),
  'A reset invalidates previously issued credentials'
);

select results_eq(
  $$
    select reason
    from private.audit_log
    where table_name = 'profiles'
      and row_id = '10000000-0000-0000-0000-000000000001'
      and action = 'UPDATE'
    order by created_at desc
    limit 1
  $$,
  array['Collector forgot the PIN'::text],
  'PIN reset preparation preserves the audit reason'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select results_eq(
  $$ select count(*) from public.customers $$,
  array[0::bigint],
  'A collector with a temporary PIN cannot access the assigned portfolio'
);

reset role;
set local role service_role;

select lives_ok(
  $$
    select public.service_complete_collector_pin_change(
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  'The service role can complete a verified PIN change'
);

reset role;

select ok(
  (
    select not must_change_pin and pin_changed_at is not null
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Completing the change clears the temporary state and records its timestamp'
);

select results_eq(
  $$
    select actor_user_id
    from private.audit_log
    where table_name = 'profiles'
      and row_id = '10000000-0000-0000-0000-000000000001'
      and reason = 'collector PIN changed'
    order by created_at desc
    limit 1
  $$,
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'The verified collector is recorded as the PIN change actor'
);

do $$
begin
  perform set_config('app.audit_actor_id', '', true);
  perform set_config('app.audit_reason', '', true);
end;
$$;

update public.profiles
set
  active = false,
  credentials_invalid_before = null
where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select results_eq(
  $$ select count(*) from public.customers $$,
  array[0::bigint],
  'An inactive collector cannot access the assigned portfolio'
);

select * from finish();

rollback;
