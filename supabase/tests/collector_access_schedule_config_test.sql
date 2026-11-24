begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, email) values
  ('ac200000-0000-0000-0000-000000000001', 'schedule.admin@test.local'),
  ('ac200000-0000-0000-0000-000000000002', 'schedule.supervisor@test.local'),
  ('ac200000-0000-0000-0000-000000000003', 'schedule.collector@test.local'),
  ('ac200000-0000-0000-0000-000000000004', 'schedule.inactive-collector@test.local');

insert into public.profiles (id, dni, full_name, role, active) values
  ('ac200000-0000-0000-0000-000000000001', '92000101', 'Schedule Admin', 'admin', true),
  ('ac200000-0000-0000-0000-000000000002', '92000102', 'Schedule Supervisor', 'supervisor', true),
  ('ac200000-0000-0000-0000-000000000003', '92000103', 'Schedule Collector', 'collector', true),
  ('ac200000-0000-0000-0000-000000000004', '92000104', 'Inactive Schedule Collector', 'collector', false);

update public.profiles
set credentials_invalid_before = '2026-11-20 00:00:00+00'::timestamptz
where id = 'ac200000-0000-0000-0000-000000000004';

select ok(
  not has_function_privilege('anon', 'public.admin_get_collector_access_schedule()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_get_collector_access_schedule()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_update_collector_access_schedule(time,time,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_update_collector_access_schedule(time,time,text)', 'EXECUTE'),
  'Schedule management RPCs are authenticated-only'
);

select ok(
  not has_table_privilege('authenticated', 'private.collector_access_schedule', 'SELECT')
  and not has_table_privilege('authenticated', 'private.collector_access_schedule', 'INSERT')
  and not has_table_privilege('authenticated', 'private.collector_access_schedule', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.collector_access_schedule', 'DELETE'),
  'Authenticated users cannot read or write the private schedule table directly'
);

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000001',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000001';

select results_eq(
  $$ select start_time, end_time, timezone from public.admin_get_collector_access_schedule() $$,
  $$ values (time '07:00:00', time '20:00:00', 'America/Lima'::text) $$,
  'The management RPC exposes the shared America/Lima 07:00-20:00 defaults'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000003',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select * from public.admin_get_collector_access_schedule() $$,
  '42501', null,
  'A collector cannot read the restricted schedule'
);
select throws_ok(
  $$ select public.admin_update_collector_access_schedule(time '08:00', time '17:00', 'unauthorized') $$,
  '42501', null,
  'A collector cannot update the schedule'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000002',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000002';
select throws_ok(
  $$ select * from public.admin_get_collector_access_schedule() $$,
  '42501', null,
  'A supervisor cannot read the restricted schedule'
);
select throws_ok(
  $$ select public.admin_update_collector_access_schedule(time '08:00', time '17:00', 'unauthorized') $$,
  '42501', null,
  'A supervisor cannot update the restricted schedule'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000003',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000003';
set local app.test_business_timestamp = '2026-11-05 07:00:00-05';
select is(
  (select private.current_app_role()), 'collector'::public.app_role,
  'The configured opening boundary remains inclusive at 07:00'
);
set local app.test_business_timestamp = '2026-11-05 20:00:00-05';
select is(
  (select private.current_app_role()), null::public.app_role,
  'The configured closing boundary remains exclusive at 20:00'
);
select is(
  (select allowed from public.current_access_status()), false,
  'The access status path uses the same default schedule'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000001',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000001';
reset role;
select set_config('test.schedule.audit_before',
  (select count(*)::text from private.access_control_audit_log), true);
select set_config('test.schedule.collector_credentials_before',
  (select coalesce(credentials_invalid_before::text, 'null') from public.profiles
   where id = 'ac200000-0000-0000-0000-000000000003'), true);
set local role authenticated;
select public.admin_update_collector_access_schedule(time '08:00', time '17:00', 'Approved schedule change');

select results_eq(
  $$ select start_time, end_time, timezone from public.admin_get_collector_access_schedule() $$,
  $$ values (time '08:00:00', time '17:00:00', 'America/Lima'::text) $$,
  'The updated schedule is returned by the management RPC'
);
reset role;
select ok(
  (select count(*) = current_setting('test.schedule.audit_before')::bigint + 1
   from private.access_control_audit_log
   where action = 'collector_access_schedule_updated'
     and target_type = 'collector_access_schedule'
     and reason = 'Approved schedule change'
     and before_data ->> 'startTime' = '07:00:00'
     and before_data ->> 'endTime' = '20:00:00'
     and after_data ->> 'startTime' = '08:00:00'
     and after_data ->> 'endTime' = '17:00:00'),
  'The successful update writes before/after audit data in the same transaction'
);
set local role authenticated;
select ok(
  (select case
      when current_setting('test.schedule.collector_credentials_before') = 'null'
        then credentials_invalid_before is not null
      else credentials_invalid_before > current_setting('test.schedule.collector_credentials_before')::timestamptz
    end
   from public.profiles where id = 'ac200000-0000-0000-0000-000000000003'),
  'A schedule change invalidates existing collector credentials'
);
select is(
  (select credentials_invalid_before from public.profiles
   where id = 'ac200000-0000-0000-0000-000000000001'), null::timestamptz,
  'A schedule change does not invalidate administrator credentials'
);
select is(
  (select credentials_invalid_before from public.profiles
   where id = 'ac200000-0000-0000-0000-000000000004'),
  '2026-11-20 00:00:00+00'::timestamptz,
  'A schedule change does not invalidate inactive collector credentials'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000003',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000003';
set local app.test_business_timestamp = '2026-11-05 07:59:59-05';
select is((select private.current_app_role()), null::public.app_role,
  'The changed schedule closes the current-app-role path before 08:00');
set local app.test_business_timestamp = '2026-11-05 08:00:00-05';
select is((select private.current_app_role()), 'collector'::public.app_role,
  'The changed schedule opens the current-app-role path at 08:00');
set local app.test_business_timestamp = '2026-11-05 17:00:00-05';
select is((select allowed from public.current_access_status()), false,
  'The changed schedule closes the access-status path at 17:00');
set local app.test_business_timestamp = '2026-11-05 16:59:59-05';
select is((select allowed from public.current_access_status()), true,
  'The changed schedule keeps the access-status path open before 17:00');

select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000002',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000002';
set local app.test_business_timestamp = '2026-11-05 23:00:00-05';
select is((select private.current_app_role()), 'supervisor'::public.app_role,
  'Supervisors remain unrestricted outside collector hours');
select is((select allowed from public.current_access_status()), true,
  'The access-status path remains unrestricted for supervisors');
select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000001',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000001';
select is((select private.current_app_role()), 'admin'::public.app_role,
  'Administrators remain unrestricted outside collector hours');

select throws_ok(
  $$ select public.admin_update_collector_access_schedule(time '08:00', time '08:00', 'equal') $$,
  '22023', null, 'Equal schedule times are rejected'
);
select throws_ok(
  $$ select public.admin_update_collector_access_schedule(time '17:00', time '08:00', 'reversed') $$,
  '22023', null, 'Reversed schedule times are rejected'
);
select throws_ok(
  $$ select public.admin_update_collector_access_schedule(null, time '17:00', 'missing') $$,
  '22023', null, 'Missing schedule times are rejected'
);
select throws_ok(
  $$ select public.admin_update_collector_access_schedule(time '08:00', time '17:00', '   ') $$,
  '22023', null, 'Blank schedule reasons are rejected'
);

reset role;
select set_config('test.schedule.audit_before_noop',
  (select count(*)::text from private.access_control_audit_log), true);
select set_config('test.schedule.collector_credentials_before_noop',
  (select credentials_invalid_before::text from public.profiles
   where id = 'ac200000-0000-0000-0000-000000000003'), true);
select set_config('test.schedule.admin_credentials_before_noop',
  (select coalesce(credentials_invalid_before::text, 'null') from public.profiles
   where id = 'ac200000-0000-0000-0000-000000000001'), true);
set local role authenticated;
select public.admin_update_collector_access_schedule(time '08:00', time '17:00', 'No-op change');
reset role;
select is((select count(*)::text from private.access_control_audit_log),
  current_setting('test.schedule.audit_before_noop'),
  'A no-op schedule update does not create an audit record');
select is((select coalesce(credentials_invalid_before::text, 'null') from public.profiles
  where id = 'ac200000-0000-0000-0000-000000000001'),
  current_setting('test.schedule.admin_credentials_before_noop'),
  'A no-op schedule update does not invalidate credentials');
select is((select credentials_invalid_before::text from public.profiles
  where id = 'ac200000-0000-0000-0000-000000000003'),
  current_setting('test.schedule.collector_credentials_before_noop'),
  'A no-op schedule update leaves active collector credentials unchanged');

reset role;
delete from private.collector_access_schedule;
select is(
  private.collector_access_is_open('2026-11-05 12:00:00-05'::timestamptz), false,
  'Missing schedule configuration fails closed'
);

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', 'ac200000-0000-0000-0000-000000000003',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'ac200000-0000-0000-0000-000000000003';
select is((select private.current_app_role()), null::public.app_role,
  'A collector has no application role when schedule configuration is missing');
select is((select allowed from public.current_access_status()), false,
  'The access-status path denies a collector when schedule configuration is missing');

reset role;
insert into private.collector_access_schedule(singleton, start_time, end_time, timezone)
values (true, time '08:00', time '17:00', 'America/Lima');
select throws_ok(
  $$ update private.collector_access_schedule set end_time = time '08:00' $$,
  '23514', null,
  'The table constraint rejects invalid schedule configuration'
);

select * from finish();

rollback;

