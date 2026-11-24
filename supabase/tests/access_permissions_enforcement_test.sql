begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- Collector access hours are open at this instant, so collector assertions are not vacuous.
select set_config(
  'app.test_business_timestamp',
  ('2026-11-15 12:00:00'::timestamp at time zone 'America/Lima')::text,
  true
);

insert into auth.users (id, email) values
  ('b2000000-0000-0000-0000-000000000001', 'perm.admin@test.local'),
  ('b2000000-0000-0000-0000-000000000002', 'perm.supervisor@test.local'),
  ('b2000000-0000-0000-0000-000000000003', 'perm.limited-supervisor@test.local'),
  ('b2000000-0000-0000-0000-000000000004', 'perm.limited-admin@test.local'),
  ('b2000000-0000-0000-0000-000000000005', 'perm.collector@test.local');

insert into public.profiles (id, dni, full_name, role, active) values
  ('b2000000-0000-0000-0000-000000000001', '98100001', 'Perm Admin', 'admin', true),
  ('b2000000-0000-0000-0000-000000000002', '98100002', 'Perm Supervisor', 'supervisor', true),
  ('b2000000-0000-0000-0000-000000000003', '98100003', 'Perm Limited Supervisor', 'supervisor', true),
  ('b2000000-0000-0000-0000-000000000004', '98100004', 'Perm Limited Admin', 'admin', true),
  ('b2000000-0000-0000-0000-000000000005', '98100005', 'Perm Collector', 'collector', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by, active)
values (
  'b3000000-0000-0000-0000-000000000001', '98200001', 'Perm Client',
  'b2000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000001', true
);

-- 1. Every operation named in the migration carries the permission check.
select is(
  (select count(*)
   from (values
     ('public.admin_dashboard_summary()'),
     ('public.admin_dashboard_collector_performance()'),
     ('public.admin_dashboard_financial_series(text,date)'),
     ('public.admin_analytics_series(date,date,text,uuid)'),
     ('public.admin_analytics_collectors(date,date)'),
     ('public.admin_analytics_expense_categories(date,date,uuid)'),
     ('public.admin_list_loans_page(integer,integer,text,public.loan_status,uuid,public.loan_frequency)'),
     ('public.admin_update_loan(uuid,numeric,numeric,public.loan_frequency,integer,date,text)'),
     ('public.renew_loan(uuid,numeric,numeric,public.loan_frequency,integer,date)'),
     ('public.register_payment(uuid,numeric,text,timestamptz,text)'),
     ('public.void_payment(uuid,text)'),
     ('public.admin_create_loan(uuid,numeric,numeric,public.loan_frequency,integer,date,date)'),
     ('public.admin_list_collectors()'),
     ('public.admin_create_collector_profile(uuid,text,text,text)'),
     ('public.admin_update_collector_profile(uuid,text,text,text)'),
     ('public.admin_set_collector_active(uuid,boolean,text)'),
     ('public.admin_prepare_collector_pin_reset(uuid,text)'),
     ('public.admin_daily_control_report(date,uuid)'),
     ('public.register_cash_opening(uuid,date,numeric,text)'),
     ('public.validate_cash_closure(uuid,text)'),
     ('public.review_cash_expense(uuid,boolean,text)'),
     ('public.review_cash_allowance_request(uuid,boolean,text)'),
     ('public.list_correction_requests(public.correction_request_status,integer)'),
     ('public.count_pending_correction_requests()'),
     ('public.resolve_edit_loan_request(uuid,numeric,numeric,public.loan_frequency,integer,date,text)'),
     ('public.resolve_void_loan_request(uuid,text)'),
     ('public.resolve_void_payment_request(uuid,text)'),
     ('public.reject_correction_request(uuid,text)')
   ) as protected(signature)
   join pg_proc p on p.oid = to_regprocedure(protected.signature)
   where p.prosrc ~ 'private\.require_(back_office_permission|back_office_any_permission|admin_permission)'),
  28::bigint,
  'All 28 administrative RPCs enforce an access permission before their original body'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'customers_enforce_access_permissions'
      and tgrelid = 'public.customers'::regclass
      and not tgisinternal
  ),
  'Direct customer writes are protected by a permission trigger'
);

select ok(
  not has_function_privilege('anon', 'private.require_back_office_permission(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.require_admin_permission(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.require_back_office_permission(text)', 'EXECUTE'),
  'The permission helpers are not callable by anonymous clients'
);

-- Setup: a system administrator defines a limited role and assigns it to a supervisor and an admin.
set local role authenticated;
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select set_config('test.perm.limited_role_id',
       public.admin_create_access_role('Limited operator', 'Dashboard and client view only',
         array['dashboard.view', 'clients.view'], 'enforcement test')::text, true) $$,
  'The system administrator creates a limited custom role'
);
select lives_ok(
  $$ select public.admin_assign_access_role('b2000000-0000-0000-0000-000000000003',
       current_setting('test.perm.limited_role_id')::uuid, 'limit supervisor') $$,
  'The limited role is assigned to a supervisor'
);
select lives_ok(
  $$ select public.admin_assign_access_role('b2000000-0000-0000-0000-000000000004',
       current_setting('test.perm.limited_role_id')::uuid, 'limit admin') $$,
  'The limited role is assigned to a second administrator'
);

-- System administrator keeps everything.
select lives_ok(
  $$ select * from public.admin_dashboard_summary() $$,
  'The system administrator can read the dashboard'
);
select lives_ok(
  $$ update public.customers set notes = 'edited by admin'
     where id = 'b3000000-0000-0000-0000-000000000001' $$,
  'The system administrator can edit a client directly'
);
select ok(
  private.has_permission('loans.create') and private.has_permission('collectors.reset_pin'),
  'The system administrator holds the admin-only permissions'
);

-- Default supervisor: parity with what supervisors could already do.
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b2000000-0000-0000-0000-000000000002')::text, true);
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ select * from public.admin_dashboard_summary() $$,
  'A default supervisor can read the dashboard'
);
select lives_ok(
  $$ select * from public.admin_list_loans_page(0, 10, null::text, null::public.loan_status, null::uuid, null::public.loan_frequency) $$,
  'A default supervisor can list loans'
);
select throws_ok(
  $$ select public.admin_create_loan('b3000000-0000-0000-0000-000000000001'::uuid, 100, 20,
       'daily'::public.loan_frequency, 10, current_date, current_date + 1) $$,
  '42501', 'Only administrators may create loans',
  'A supervisor still receives the original admin-only denial message'
);
select lives_ok(
  $$ update public.customers set notes = 'edited by supervisor'
     where id = 'b3000000-0000-0000-0000-000000000001' $$,
  'A default supervisor can edit a client directly'
);

-- Supervisor holding the limited role.
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b2000000-0000-0000-0000-000000000003',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000003';

select lives_ok(
  $$ select * from public.admin_dashboard_summary() $$,
  'The limited supervisor can read the dashboard it was granted'
);
select lives_ok(
  $$ select * from public.admin_list_collectors() $$,
  'Any of collectors.view, loans.view or clients.view is enough to list collectors'
);
select throws_ok(
  $$ select * from public.admin_list_loans_page(0, 10, null::text, null::public.loan_status, null::uuid, null::public.loan_frequency) $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot list loans'
);
select throws_ok(
  $$ select * from public.admin_daily_control_report('2031-03-01'::date, null::uuid) $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot read the daily control report'
);
select throws_ok(
  $$ select * from public.admin_analytics_series('2031-03-01'::date, '2031-03-02'::date, 'day', null::uuid) $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot read analytics'
);
select throws_ok(
  $$ select * from public.list_correction_requests(null::public.correction_request_status, 10) $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot list correction requests'
);
select throws_ok(
  $$ select public.register_payment('b9000000-0000-0000-0000-0000000000aa'::uuid, 10, 'cash') $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot register payments'
);
select throws_ok(
  $$ select public.void_payment('b9000000-0000-0000-0000-0000000000aa'::uuid, 'not needed anymore') $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot void payments'
);
select throws_ok(
  $$ select public.validate_cash_closure('b9000000-0000-0000-0000-0000000000aa'::uuid, null) $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot validate cash closures'
);
select throws_ok(
  $$ select public.reject_correction_request('b9000000-0000-0000-0000-0000000000aa'::uuid, 'not valid') $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot reject correction requests'
);
select throws_ok(
  $$ insert into public.customers (document_number, full_name, collector_id, created_by)
     values ('98200002', 'Denied client', 'b2000000-0000-0000-0000-000000000005',
             'b2000000-0000-0000-0000-000000000003') $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot create clients directly'
);
select throws_ok(
  $$ update public.customers set notes = 'edited by limited supervisor'
     where id = 'b3000000-0000-0000-0000-000000000001' $$,
  '42501', 'Required access permission is missing',
  'The limited supervisor cannot edit clients directly'
);

-- Administrator holding the limited role: admin-only operations are permission-gated too.
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b2000000-0000-0000-0000-000000000004',
  'iat', floor(extract(epoch from statement_timestamp()))::bigint + 3600)::text, true);
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000004';

select lives_ok(
  $$ select * from public.admin_dashboard_summary() $$,
  'The limited administrator can read the dashboard it was granted'
);
select throws_ok(
  $$ select public.admin_create_loan('b3000000-0000-0000-0000-000000000001'::uuid, 100, 20,
       'daily'::public.loan_frequency, 10, current_date, current_date + 1) $$,
  '42501', 'Required access permission is missing',
  'An administrator without loans.create cannot create loans'
);
select throws_ok(
  $$ select public.admin_create_collector_profile('b9000000-0000-0000-0000-0000000000bb'::uuid,
       '12345678', 'New Collector', null) $$,
  '42501', 'Required access permission is missing',
  'An administrator without collectors.manage cannot create collectors'
);
select throws_ok(
  $$ select * from public.admin_prepare_collector_pin_reset(
       'b2000000-0000-0000-0000-000000000005'::uuid, 'forgotten pin') $$,
  '42501', 'Required access permission is missing',
  'An administrator without collectors.reset_pin cannot reset a collector PIN'
);
select throws_ok(
  $$ select public.admin_update_loan('b9000000-0000-0000-0000-0000000000cc'::uuid, 100, 20,
       'daily'::public.loan_frequency, 10, current_date, 'fix typo in loan') $$,
  '42501', 'Required access permission is missing',
  'An administrator without loans.update cannot edit loans'
);

-- The helpers leave collectors and supervisors to the original guards.
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b2000000-0000-0000-0000-000000000005')::text, true);
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000005';
select lives_ok(
  $$ select private.require_back_office_permission('payments.register') $$,
  'Collectors are not subject to the back-office permission layer'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', 'b2000000-0000-0000-0000-000000000002')::text, true);
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000002';
select lives_ok(
  $$ select private.require_admin_permission('loans.create') $$,
  'Supervisors are not subject to the admin-only permission layer'
);

select * from finish();
rollback;
