begin;

select set_config(
  'app.test_business_timestamp',
  (
    (((now() at time zone 'America/Lima')::date + time '12:00:00')
      at time zone 'America/Lima')
  )::text,
  true
);

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email)
values
  ('a1000000-0000-0000-0000-000000000001', 'lockout.admin@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'lockout.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('a1000000-0000-0000-0000-000000000001', '91000001', 'Lockout Admin', 'admin', true),
  ('a1000000-0000-0000-0000-000000000002', '91000002', 'Lockout Collector', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values (
  'a2000000-0000-0000-0000-000000000001',
  '91000003',
  'Lockout Test Customer',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  true
);

select ok(
  not has_function_privilege(
    'anon',
    'public.service_record_login_attempt(uuid,boolean)',
    'EXECUTE'
  ),
  'Anonymous callers cannot change the per-account PIN attempt state'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.service_record_login_attempt(uuid,boolean)',
    'EXECUTE'
  ),
  'Authenticated callers cannot change the per-account PIN attempt state'
);

create temporary table failed_attempt_results (
  attempt_number integer primary key,
  locked boolean not null,
  failed_attempts smallint not null
) on commit drop;

select lives_ok(
  $$
    do $block$
    declare
      attempt_number integer;
    begin
      for attempt_number in 1..4 loop
        insert into failed_attempt_results
        select attempt_number, result.locked, result.failed_attempts
        from public.service_record_login_attempt(
          'a1000000-0000-0000-0000-000000000002'::uuid,
          false
        ) as result;
      end loop;
    end
    $block$
  $$,
  'Four consecutive failed PIN verifications are recorded sequentially'
);

select results_eq(
  $$
    select locked, failed_attempts
    from failed_attempt_results
    order by attempt_number
  $$,
  $$ values
    (false, 1::smallint),
    (false, 2::smallint),
    (false, 3::smallint),
    (false, 4::smallint)
  $$,
  'Four failures remain below the cooldown threshold'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select private.current_app_role()),
  'collector'::public.app_role,
  'Four failed attempts do not alter an authenticated collector session'
);

reset role;

select results_eq(
  $$
    select locked, failed_attempts
    from public.service_record_login_attempt(
      'a1000000-0000-0000-0000-000000000002'::uuid,
      false
    )
  $$,
  $$ values (true, 5::smallint) $$,
  'The fifth failure starts a temporary PIN cooldown'
);

select results_eq(
  $$
    select
      pin_locked_until is not null,
      round(extract(epoch from (pin_locked_until - pin_locked_at)))::bigint
    from public.profiles
    where id = 'a1000000-0000-0000-0000-000000000002'
  $$,
  $$ values (true, 900::bigint) $$,
  'The first cooldown lasts fifteen minutes instead of being permanent'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select private.current_app_role()),
  'collector'::public.app_role,
  'A PIN cooldown does not revoke an already-valid application role'
);

select results_eq(
  $$
    select count(*)
    from public.customers
    where id = 'a2000000-0000-0000-0000-000000000001'
  $$,
  array[1::bigint],
  'A PIN cooldown does not interrupt an authenticated collector portfolio'
);

select results_eq(
  $$ select allowed from public.current_access_status() $$,
  array[true],
  'The access-status RPC does not treat a login cooldown as session revocation'
);

reset role;

update public.profiles
set pin_locked_until = clock_timestamp() - interval '1 second'
where id = 'a1000000-0000-0000-0000-000000000002';

select results_eq(
  $$
    select locked, failed_attempts
    from public.service_record_login_attempt(
      'a1000000-0000-0000-0000-000000000002'::uuid,
      false
    )
  $$,
  $$ values (true, 6::smallint) $$,
  'A failure after cooldown expiry starts the next progressive cooldown'
);

select results_eq(
  $$
    select round(extract(epoch from (pin_locked_until - pin_locked_at)))::bigint
    from public.profiles
    where id = 'a1000000-0000-0000-0000-000000000002'
  $$,
  array[1800::bigint],
  'The second cooldown grows to thirty minutes'
);

-- The function must run in its own statement: a join against public.profiles in
-- the same statement would use the statement's snapshot and still see the
-- pre-update row, hiding the cleared counters.
create temporary table success_attempt_result on commit drop as
select locked, failed_attempts
from public.service_record_login_attempt(
  'a1000000-0000-0000-0000-000000000002'::uuid,
  true
);

select results_eq(
  $$
    select
      r.locked,
      r.failed_attempts,
      p.pin_locked_at is null,
      p.pin_locked_until is null
    from success_attempt_result r
    join public.profiles p
      on p.id = 'a1000000-0000-0000-0000-000000000002'
  $$,
  $$ values (false, 0::smallint, true, true) $$,
  'A successful PIN verification clears counters and cooldown timestamps'
);

update public.profiles
set
  failed_pin_attempts = 5,
  pin_locked_at = clock_timestamp(),
  pin_locked_until = clock_timestamp() + interval '15 minutes'
where id = 'a1000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.admin_prepare_collector_pin_reset(
      'a1000000-0000-0000-0000-000000000002'::uuid,
      'Se entrega un PIN nuevo al cobrador'
    )
  $$,
  'An administrator PIN reset also clears the temporary cooldown'
);

reset role;

select results_eq(
  $$
    select failed_pin_attempts, pin_locked_at is null, pin_locked_until is null
    from public.profiles
    where id = 'a1000000-0000-0000-0000-000000000002'
  $$,
  $$ values (0::smallint, true, true) $$,
  'An administrator PIN reset clears every cooldown field'
);

update public.profiles
set
  failed_pin_attempts = 3,
  pin_locked_at = clock_timestamp(),
  pin_locked_until = clock_timestamp() + interval '15 minutes'
where id = 'a1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select public.service_complete_pin_change(
      'a1000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  'Completing a verified self-service PIN change clears its attempt state'
);

select results_eq(
  $$
    select failed_pin_attempts, pin_locked_at is null, pin_locked_until is null
    from public.profiles
    where id = 'a1000000-0000-0000-0000-000000000002'
  $$,
  $$ values (0::smallint, true, true) $$,
  'Self-service PIN completion clears every cooldown field'
);

select * from finish();

rollback;
