begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ============================================================
-- REQUERIMIENTO.md sections 2 and 13: "Si alguien se equivoca
-- varias veces seguidas, el sistema lo bloquea por seguridad, y
-- el administrador puede darle una clave nueva."
--
-- service_record_login_attempt is only called by the `login`
-- Edge Function via the service-role/admin client -- there is no
-- HTTP/auth flow to exercise here, so this file tests the SQL
-- layer directly: the counter, the lock threshold, the resulting
-- loss of business access via private.current_app_role() (the
-- same function every RLS policy and financial RPC already
-- depends on), and that an administrator issuing a new PIN is
-- the only way to clear the lock.
-- ============================================================

insert into auth.users (id, email)
values
  ('a1000000-0000-0000-0000-000000000001', 'lockout.admin@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'lockout.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('a1000000-0000-0000-0000-000000000001', '91000001', 'Lockout Admin', 'admin', true),
  ('a1000000-0000-0000-0000-000000000002', '91000002', 'Lockout Collector', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values
  (
    'a2000000-0000-0000-0000-000000000001',
    '91000003',
    'Lockout Test Customer',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    true
  );

-- ============================================================
-- TEST 1-2
-- Only service_role (the Edge Function's admin client) may call
-- this -- never anon or an already-authenticated user, since it
-- would otherwise let anyone reset or inflate anyone else's
-- failed-attempt counter.
-- ============================================================

select ok(
  not has_function_privilege(
    'anon',
    'public.service_record_login_attempt(uuid,boolean)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute service_record_login_attempt'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.service_record_login_attempt(uuid,boolean)',
    'EXECUTE'
  ),
  'Authenticated callers cannot execute service_record_login_attempt'
);

-- ============================================================
-- TEST 3
-- Four consecutive failures stay below the lockout threshold.
-- Uses a sequential DO block (same pattern as
-- financial_rpcs_test.sql) instead of UNION ALL, since the order
-- of execution of a volatile, side-effecting function across
-- UNION ALL branches is not guaranteed by Postgres.
-- ============================================================

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
        insert into failed_attempt_results (
          attempt_number, locked, failed_attempts
        )
        select attempt_number, result.locked, result.failed_attempts
        from public.service_record_login_attempt(
          'a1000000-0000-0000-0000-000000000002'::uuid, false
        ) as result;
      end loop;
    end
    $block$
  $$,
  'Four consecutive failed attempts can be recorded sequentially'
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
  'Four consecutive failed attempts increment the counter without locking the account'
);

-- ============================================================
-- TEST 4
-- The account is still usable (not locked) before the 5th
-- failure -- current_app_role() still resolves.
-- ============================================================

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select private.current_app_role()),
  'collector'::public.app_role,
  'A collector with 4 failed attempts can still authenticate for business access'
);

reset role;

-- ============================================================
-- TEST 5
-- The 5th consecutive failure crosses the threshold and locks
-- the account.
-- ============================================================

select results_eq(
  $$
    select locked, failed_attempts
    from public.service_record_login_attempt(
      'a1000000-0000-0000-0000-000000000002'::uuid, false
    )
  $$,
  $$ values (true, 5::smallint) $$,
  'The fifth consecutive failed attempt locks the account'
);

-- ============================================================
-- TEST 6
-- Once locked, private.current_app_role() returns null -- every
-- RLS policy and financial RPC that depends on it now denies
-- access, exactly like an inactive account or a forced PIN
-- change already do.
-- ============================================================

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select private.current_app_role()),
  null::public.app_role,
  'A locked account resolves no application role at all'
);

-- ============================================================
-- TEST 7
-- As a direct business consequence, a locked collector can no
-- longer see even their own portfolio.
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.customers
    where id = 'a2000000-0000-0000-0000-000000000001'
  $$,
  array[0::bigint],
  'A locked collector loses access to their own portfolio'
);

reset role;

-- ============================================================
-- TEST 8
-- Further failed attempts on an already-locked account do not
-- raise an error and keep reporting locked = true (idempotent).
-- ============================================================

select results_eq(
  $$
    select locked
    from public.service_record_login_attempt(
      'a1000000-0000-0000-0000-000000000002'::uuid, false
    )
  $$,
  array[true],
  'Recording another failure on an already-locked account stays locked without error'
);

-- ============================================================
-- TEST 9
-- Giving the collector a new PIN (the documented unlock path:
-- "el administrador puede darle una clave nueva") clears both
-- the lock and the failed-attempt counter.
-- ============================================================

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.admin_prepare_collector_pin_reset(
      'a1000000-0000-0000-0000-000000000002'::uuid,
      'Cuenta bloqueada, se entrega PIN nuevo'
    )
  $$,
  'An administrator can reset the PIN of a locked collector'
);

reset role;

select results_eq(
  $$
    select failed_pin_attempts, pin_locked_at is null
    from public.profiles
    where id = 'a1000000-0000-0000-0000-000000000002'
  $$,
  $$ values (0::smallint, true) $$,
  'Resetting the PIN clears the failed-attempt counter and the lock'
);

-- ============================================================
-- TEST 10-11
-- A successful login resets the counter back to zero, and
-- completing a normal PIN change does the same (defensive reset,
-- mirrors the admin-reset path for the self-service change-pin
-- flow). These are two separate top-level statements (not
-- combined with UNION ALL) so their side effects are guaranteed
-- to apply in textual order.
-- ============================================================

select results_eq(
  $$
    select locked, failed_attempts
    from public.service_record_login_attempt(
      'a1000000-0000-0000-0000-000000000002'::uuid, false
    )
  $$,
  $$ values (false, 1::smallint) $$,
  'A failed attempt right after an admin PIN reset starts the counter at one'
);

select results_eq(
  $$
    select locked, failed_attempts
    from public.service_record_login_attempt(
      'a1000000-0000-0000-0000-000000000002'::uuid, true
    )
  $$,
  $$ values (false, 0::smallint) $$,
  'A successful attempt resets the failed-attempt counter to zero'
);

update public.profiles
set failed_pin_attempts = 3
where id = 'a1000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select public.service_complete_collector_pin_change(
      'a1000000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  'Completing a self-service PIN change also resets the failed-attempt counter'
);

select * from finish();

rollback;
