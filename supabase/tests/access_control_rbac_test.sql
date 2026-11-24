begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'rbac.admin@test.local'),
  ('f1000000-0000-0000-0000-000000000002', 'rbac.supervisor@test.local'),
  ('f1000000-0000-0000-0000-000000000003', 'rbac.collector@test.local'),
  ('f1000000-0000-0000-0000-000000000004', 'rbac.other-admin@test.local');

insert into public.profiles (id, dni, full_name, role, active) values
  ('f1000000-0000-0000-0000-000000000001', '97000001', 'RBAC Admin', 'admin', true),
  ('f1000000-0000-0000-0000-000000000002', '97000002', 'RBAC Supervisor', 'supervisor', true),
  ('f1000000-0000-0000-0000-000000000003', '97000003', 'RBAC Collector', 'collector', true),
  ('f1000000-0000-0000-0000-000000000004', '97000004', 'RBAC Other Admin', 'admin', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values ('f2000000-0000-0000-0000-000000000001', '98000001', 'RBAC Client',
  'f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', true);

select set_config('test.rbac.system_role_id',
  (select id::text from private.access_roles where slug = 'system_administrator'), true);
select set_config('test.rbac.supervisor_role_id',
  (select id::text from private.access_roles where slug = 'supervisor_default'), true);

select ok(
  has_table_privilege('authenticated', 'private.access_roles', 'SELECT') = false
  and has_table_privilege('anon', 'private.access_roles', 'SELECT') = false
  and has_table_privilege('authenticated', 'private.access_permissions', 'SELECT') = false
  and has_table_privilege('authenticated', 'private.access_role_permissions', 'SELECT') = false
  and has_table_privilege('authenticated', 'private.profile_access_roles', 'SELECT') = false
  and has_table_privilege('authenticated', 'private.access_control_audit_log', 'SELECT') = false,
  'Private access tables are not directly readable by API roles'
);

select ok(
  not has_function_privilege('anon', 'public.admin_create_access_role(text,text,text[],text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_create_access_role(text,text,text[],text)', 'EXECUTE'),
  'Administrative mutations are callable only through authenticated RPCs'
);

select is(
  (select count(*) from private.profile_access_roles where profile_id = 'f1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'An administrative user receives exactly one compatibility access role'
);

select ok(
  (select bool_and(permission_code <> 'roles.manage')
   from private.access_role_permissions arp
   join private.access_roles ar on ar.id = arp.role_id
   where ar.slug = 'supervisor_default'),
  'The default supervisor role cannot manage access roles'
);

select ok(
  (select risk_level = 'restricted' from private.access_permissions where code = 'roles.manage'),
  'roles.manage is catalogued as restricted'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000002';

select throws_ok(
  $$ select public.admin_create_access_role('Denied role', null, array['roles.manage'], 'test') $$,
  '42501', null,
  'A supervisor without roles.manage cannot create access roles'
);

select lives_ok(
  $$ select count(*) from public.admin_list_access_roles() $$,
  'A supervisor with roles.view can list access roles'
);

select lives_ok(
  $$ select public.admin_get_access_role(current_setting('test.rbac.supervisor_role_id')::uuid) $$,
  'A supervisor with roles.view can inspect an access role'
);

select lives_ok(
  $$ select count(*) from public.admin_list_access_assignments() $$,
  'A supervisor with roles.view can list administrative assignments'
);

select ok(
  private.has_permission('loans.void')
  and private.has_permission('payments.void')
  and private.has_permission('cash_closure.validate')
  and private.has_permission('correction_requests.resolve'),
  'The compatibility supervisor role retains restricted actions allowed to supervisors by existing RPCs'
);

select ok(
  not private.has_permission('loans.create')
  and not private.has_permission('collectors.manage')
  and not private.has_permission('collectors.reset_pin')
  and not private.has_permission('roles.manage')
  and not (public.current_access_context() -> 'permissions' @> '["loans.create","collectors.manage","collectors.reset_pin","roles.manage"]'::jsonb),
  'Supervisor helper and context exclude admin-only capabilities'
);

set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select ok(
  (public.current_access_context() ->> 'baseRole') = 'admin'
  and (public.current_access_context() ->> 'accessRole') = 'system_administrator',
  'The context RPC returns base and dynamic access roles'
);

select ok(
  (select private.has_permission('clients.view')),
  'The assigned system administrator has clients.view'
);

select results_eq(
  $$ select id, document_number, full_name, outstanding_amount, total_count
     from public.admin_list_clients_page(0, 10, '98000001', null) $$,
  $$ values ('f2000000-0000-0000-0000-000000000001'::uuid, '98000001'::text,
             'RBAC Client'::text, 0.00::numeric, 1::bigint) $$,
  'An authorized actor retains the existing filtered client-list result shape and values'
);

select throws_ok(
  $$ select public.admin_create_access_role('Bad reason', null, array['clients.view'], '   ') $$,
  '22023', null,
  'Role mutations reject blank reasons'
);

select lives_ok(
  $$ select set_config('test.rbac.reader_role_id', public.admin_create_access_role('Client reader', 'Read-only clients', array['clients.view'], 'RBAC test')::text, true) $$,
  'The system administrator can create an allowed custom role'
);

reset role;
select is(
  (select count(*) from private.profile_access_roles where profile_id = 'f1000000-0000-0000-0000-000000000003'),
  0::bigint,
  'Collectors remain outside dynamic RBAC'
);
set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select public.admin_create_access_role('Restricted', null, array['roles.manage'], 'RBAC test') $$,
  '42501', null,
  'Custom roles cannot receive restricted permissions'
);

reset role;
select ok(
  (select count(*) = 1 from private.access_control_audit_log
   where actor_id = 'f1000000-0000-0000-0000-000000000001'
     and action = 'role_created' and reason = 'RBAC test'
     and before_data is not null and after_data is not null),
  'Role creation writes a before/after audit record with its reason'
);
set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select public.admin_assign_access_role('f1000000-0000-0000-0000-000000000001', current_setting('test.rbac.supervisor_role_id')::uuid, 'self') $$,
  '42501', null,
  'An actor cannot change their own access assignment'
);

select throws_ok(
  $$ select public.admin_assign_access_role('f1000000-0000-0000-0000-000000000004', current_setting('test.rbac.system_role_id')::uuid, 'assign') $$,
  '42501', null,
  'The reserved system-administrator role cannot be assigned through administration'
);

select lives_ok(
  $$ select public.admin_assign_access_role('f1000000-0000-0000-0000-000000000002', current_setting('test.rbac.reader_role_id')::uuid, 'Grant client reader') $$,
  'The system administrator can assign a custom role to another administrative profile'
);

reset role;
select is(
  (select count(*) from private.profile_access_roles where profile_id = 'f1000000-0000-0000-0000-000000000002'),
  1::bigint,
  'Reassignment preserves the one-role-per-profile constraint'
);

select ok(
  (select credentials_invalid_before is not null from public.profiles where id = 'f1000000-0000-0000-0000-000000000002'),
  'Changing an assignment invalidates the affected credentials'
);

select ok(
  (select count(*) = 1 from private.access_control_audit_log
   where actor_id = 'f1000000-0000-0000-0000-000000000001'
     and action = 'assignment_changed' and target_id = 'f1000000-0000-0000-0000-000000000002'
     and before_data ->> 'accessRoleSlug' = 'supervisor_default'
     and after_data ->> 'accessRoleSlug' like 'custom_client_reader_%'),
  'Assignment changes retain atomic before and after audit values'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

-- The RPC requires the actor to be a system administrator different from the target, so at least two
-- exist whenever a system administrator is reassigned. The last-administrator guard is therefore
-- defense in depth, and the observable invariant is that one administrator always remains.
-- The local seed already contains a system administrator, so the count is compared with the state
-- before the reassignment instead of with a fixed number.
reset role;
select set_config('test.rbac.system_admins_before',
  (select count(*)::text from private.profile_access_roles a
   join private.access_roles r on r.id = a.role_id
   join public.profiles p on p.id = a.profile_id
   where r.slug = 'system_administrator' and r.active and p.active and p.role = 'admin'::public.app_role),
  true);
set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select public.admin_assign_access_role('f1000000-0000-0000-0000-000000000004', current_setting('test.rbac.reader_role_id')::uuid, 'demote second system administrator') $$,
  'A system administrator can be reassigned while another system administrator remains'
);

reset role;
select ok(
  (select count(*) from private.profile_access_roles a
   join private.access_roles r on r.id = a.role_id
   join public.profiles p on p.id = a.profile_id
   where r.slug = 'system_administrator' and r.active and p.active and p.role = 'admin'::public.app_role)
  = current_setting('test.rbac.system_admins_before')::bigint - 1
  and (select count(*) from private.profile_access_roles a
   join private.access_roles r on r.id = a.role_id
   join public.profiles p on p.id = a.profile_id
   where r.slug = 'system_administrator' and r.active and p.active and p.role = 'admin'::public.app_role) >= 1,
  'Reassigning a system administrator removes exactly that one and at least one always remains'
);
set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

reset role;
update public.profiles set role = 'supervisor'::public.app_role
where id = 'f1000000-0000-0000-0000-000000000004';
select is(
  (select r.slug from private.profile_access_roles a join private.access_roles r on r.id = a.role_id
   where a.profile_id = 'f1000000-0000-0000-0000-000000000004'),
  'supervisor_default'::text,
  'An admin-to-supervisor base-role change deterministically assigns the default supervisor role'
);
select ok(
  (select credentials_invalid_before is not null from public.profiles
   where id = 'f1000000-0000-0000-0000-000000000004'),
  'An admin-to-supervisor base-role change invalidates active credentials'
);
select set_config('test.rbac.role_change_stamp',
  (select credentials_invalid_before::text from public.profiles
   where id = 'f1000000-0000-0000-0000-000000000004'), true);
update public.profiles set role = 'supervisor'::public.app_role
where id = 'f1000000-0000-0000-0000-000000000004';
select is(
  (select credentials_invalid_before from public.profiles
   where id = 'f1000000-0000-0000-0000-000000000004'),
  current_setting('test.rbac.role_change_stamp')::timestamptz,
  'A no-op base-role update does not invalidate credentials again'
);

update public.profiles set credentials_invalid_before = '2000-01-01 00:00:00+00'
where id = 'f1000000-0000-0000-0000-000000000004';
update public.profiles set role = 'collector'::public.app_role
where id = 'f1000000-0000-0000-0000-000000000004';
select is(
  (select count(*) from private.profile_access_roles
   where profile_id = 'f1000000-0000-0000-0000-000000000004'),
  0::bigint,
  'A supervisor-to-collector base-role change removes dynamic assignment'
);
select ok(
  (select credentials_invalid_before > '2000-01-01 00:00:00+00'::timestamptz
   from public.profiles where id = 'f1000000-0000-0000-0000-000000000004'),
  'A supervisor-to-collector base-role change refreshes credential invalidation'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select public.admin_assign_access_role('f1000000-0000-0000-0000-000000000003', current_setting('test.rbac.system_role_id')::uuid, 'collector') $$,
  '42501', null,
  'Collectors cannot be assigned dynamic access roles'
);

set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select * from public.admin_list_clients_page(0, 10, null, null) $$,
  '42501', 'Required access permission is missing',
  'Collectors cannot use the dynamically protected administrative client-list RPC'
);
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select public.admin_set_access_role_active(current_setting('test.rbac.system_role_id')::uuid, false, 'disable') $$,
  '42501', null,
  'The reserved system-administrator role cannot be modified or disabled'
);

select throws_ok(
  $$ select public.admin_update_access_role(current_setting('test.rbac.supervisor_role_id')::uuid, 'Changed', null, array['clients.view'], 'modify') $$,
  '42501', null,
  'The reserved supervisor role cannot be modified'
);

select throws_ok(
  $$ select public.admin_set_access_role_active(current_setting('test.rbac.system_role_id')::uuid, true, '   ') $$,
  '22023', null,
  'Assignment and role-state mutations require a nonblank reason'
);

set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000002","iat":1}';
select throws_ok(
  $$ select * from public.admin_list_clients_page(0, 10, null, null) $$,
  '42501', 'Required access permission is missing',
  'The previous session is rejected after the access assignment changes'
);

select * from finish();
rollback;
