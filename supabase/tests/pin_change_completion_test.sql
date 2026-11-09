begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email)
values
  ('ac000000-0000-0000-0000-000000000001', 'pin.admin@test.local'),
  ('ac000000-0000-0000-0000-000000000002', 'pin.supervisor@test.local'),
  ('ac000000-0000-0000-0000-000000000003', 'pin.collector@test.local'),
  ('ac000000-0000-0000-0000-000000000004', 'pin.inactive@test.local');

insert into public.profiles (
  id,
  dni,
  full_name,
  role,
  active,
  must_change_pin,
  failed_pin_attempts,
  pin_locked_at
)
values
  (
    'ac000000-0000-0000-0000-000000000001',
    '93000001',
    'PIN Admin',
    'admin',
    true,
    true,
    3,
    clock_timestamp()
  ),
  (
    'ac000000-0000-0000-0000-000000000002',
    '93000002',
    'PIN Supervisor',
    'supervisor',
    true,
    true,
    4,
    clock_timestamp()
  ),
  (
    'ac000000-0000-0000-0000-000000000003',
    '93000003',
    'PIN Collector',
    'collector',
    true,
    true,
    2,
    clock_timestamp()
  ),
  (
    'ac000000-0000-0000-0000-000000000004',
    '93000004',
    'PIN Inactive',
    'admin',
    false,
    true,
    1,
    clock_timestamp()
  );

select ok(
  not has_function_privilege('anon', 'public.service_complete_pin_change(uuid)', 'EXECUTE'),
  'Anonymous callers cannot complete PIN changes'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.service_complete_pin_change(uuid)',
    'EXECUTE'
  ),
  'Authenticated callers cannot complete PIN changes directly'
);

select ok(
  has_function_privilege('service_role', 'public.service_complete_pin_change(uuid)', 'EXECUTE'),
  'Only the service role entry point can complete a verified PIN change'
);

set local role service_role;

select throws_ok(
  $$ select public.service_complete_pin_change(null) $$,
  '22023',
  'USER_ID_REQUIRED',
  'A user id is required'
);

select throws_ok(
  $$
    select public.service_complete_pin_change(
      'ac000000-0000-0000-0000-000000000099'::uuid
    )
  $$,
  'P0002',
  'ACTIVE_PROFILE_NOT_FOUND',
  'Unknown profiles cannot complete a PIN change'
);

select throws_ok(
  $$
    select public.service_complete_pin_change(
      'ac000000-0000-0000-0000-000000000004'::uuid
    )
  $$,
  'P0002',
  'ACTIVE_PROFILE_NOT_FOUND',
  'Inactive profiles cannot complete a PIN change'
);

select lives_ok(
  $$
    select public.service_complete_pin_change(
      'ac000000-0000-0000-0000-000000000001'::uuid
    )
  $$,
  'An active administrator can complete a PIN change'
);

reset role;

select results_eq(
  $$
    select
      must_change_pin,
      pin_changed_at is not null,
      credentials_invalid_before is not null,
      failed_pin_attempts,
      pin_locked_at is null
    from public.profiles
    where id = 'ac000000-0000-0000-0000-000000000001'
  $$,
  $$ values (false, true, true, 0::smallint, true) $$,
  'Administrator completion clears temporary and lockout state'
);

select results_eq(
  $$
    select actor_user_id, reason
    from private.audit_log
    where table_name = 'profiles'
      and row_id = 'ac000000-0000-0000-0000-000000000001'
      and action = 'UPDATE'
    order by created_at desc
    limit 1
  $$,
  $$ values (
    'ac000000-0000-0000-0000-000000000001'::uuid,
    'PIN changed'::text
  ) $$,
  'Administrator PIN completion records the profile owner and generic audit reason'
);

set local role service_role;

select lives_ok(
  $$
    select public.service_complete_pin_change(
      'ac000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  'An active supervisor can complete a PIN change'
);

reset role;

select is(
  (select must_change_pin from public.profiles where id = 'ac000000-0000-0000-0000-000000000002'),
  false,
  'Supervisor completion clears the temporary PIN state'
);

set local role service_role;

select lives_ok(
  $$
    select public.service_complete_pin_change(
      'ac000000-0000-0000-0000-000000000003'::uuid
    )
  $$,
  'An active collector can complete a PIN change through the generic function'
);

reset role;

select results_eq(
  $$
    select must_change_pin, failed_pin_attempts, pin_locked_at is null
    from public.profiles
    where id = 'ac000000-0000-0000-0000-000000000003'
  $$,
  $$ values (false, 0::smallint, true) $$,
  'Collector completion retains the existing reset behavior'
);

set local role service_role;

select lives_ok(
  $$
    select public.service_complete_collector_pin_change(
      'ac000000-0000-0000-0000-000000000003'::uuid
    )
  $$,
  'The rolling-deployment collector entry point remains available'
);

select throws_ok(
  $$
    select public.service_complete_collector_pin_change(
      'ac000000-0000-0000-0000-000000000001'::uuid
    )
  $$,
  'P0002',
  'ACTIVE_COLLECTOR_NOT_FOUND',
  'The compatibility entry point remains collector-only'
);

select * from finish();

rollback;
