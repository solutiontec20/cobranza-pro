begin;

select set_config(
  'app.test_business_timestamp',
  (
    (
      (now() at time zone 'America/Lima')::date + time '12:00:00'
    ) at time zone 'America/Lima'
  )::text,
  true
);

create extension if not exists pgtap with schema extensions;

select plan(77);

insert into auth.users (id, email)
values
  ('91000000-0000-0000-0000-000000000001', 'correction.collector.a@test.local'),
  ('91000000-0000-0000-0000-000000000002', 'correction.collector.b@test.local'),
  ('91000000-0000-0000-0000-000000000003', 'correction.collector.inactive@test.local'),
  ('91000000-0000-0000-0000-000000000004', 'correction.admin@test.local'),
  ('91000000-0000-0000-0000-000000000005', 'correction.supervisor@test.local');

insert into public.profiles (id, dni, full_name, role, active)
values
  ('91000000-0000-0000-0000-000000000001', '91000001', 'Correction Collector A', 'collector', true),
  ('91000000-0000-0000-0000-000000000002', '91000002', 'Correction Collector B', 'collector', true),
  ('91000000-0000-0000-0000-000000000003', '91000003', 'Inactive Correction Collector', 'collector', false),
  ('91000000-0000-0000-0000-000000000004', '91000004', 'Correction Administrator', 'admin', true),
  ('91000000-0000-0000-0000-000000000005', '91000005', 'Correction Supervisor', 'supervisor', true);

insert into public.customers (id, document_number, full_name, collector_id, created_by)
values
  ('92000000-0000-0000-0000-000000000001', '92000001', 'Edit Request Customer', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004'),
  ('92000000-0000-0000-0000-000000000002', '92000002', 'Payment Request Customer', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004'),
  ('92000000-0000-0000-0000-000000000003', '92000003', 'Loan Void Customer', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004'),
  ('92000000-0000-0000-0000-000000000004', '92000004', 'Posted Payment Customer', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004'),
  ('92000000-0000-0000-0000-000000000005', '92000005', 'Other Portfolio Customer', '91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004');

select has_table('public', 'correction_requests', 'Correction requests are persisted');
select has_table('public', 'correction_request_reads', 'Correction notification reads are persisted');

select results_eq(
  $$ select unnest(enum_range(null::public.correction_request_type))::text $$,
  array['edit_loan'::text, 'void_loan'::text, 'void_payment'::text],
  'Correction request types are closed and explicit'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.correction_requests'::regclass),
  'Correction requests have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.correction_request_reads'::regclass),
  'Correction notification reads have RLS enabled'
);

select ok(has_table_privilege('authenticated', 'public.correction_requests', 'SELECT'), 'Authenticated users receive SELECT only');
select ok(not has_table_privilege('authenticated', 'public.correction_requests', 'INSERT'), 'Authenticated users cannot insert requests directly');
select ok(not has_table_privilege('authenticated', 'public.correction_requests', 'UPDATE'), 'Authenticated users cannot update requests directly');
select ok(not has_table_privilege('authenticated', 'public.correction_requests', 'DELETE'), 'Authenticated users cannot delete requests directly');
select ok(
  not has_table_privilege('authenticated', 'public.correction_request_reads', 'SELECT'),
  'Read receipts are only exposed through scoped RPCs'
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'correction_requests'
  ),
  'Correction requests are published to Supabase Realtime'
);
select ok(
  has_function_privilege('authenticated', 'public.create_correction_request(public.correction_request_type,uuid,text,uuid,jsonb)', 'EXECUTE'),
  'Authenticated callers can execute request creation subject to role checks'
);
select ok(
  not has_function_privilege('anon', 'public.create_correction_request(public.correction_request_type,uuid,text,uuid,jsonb)', 'EXECUTE'),
  'Anonymous callers cannot execute request creation'
);
select ok(
  not has_function_privilege('anon', 'public.resolve_void_loan_request(uuid,text)', 'EXECUTE'),
  'Anonymous callers cannot execute financial resolution'
);
select ok(
  has_function_privilege('authenticated', 'public.list_my_correction_requests(integer)', 'EXECUTE'),
  'Collectors can execute their scoped notification list'
);
select ok(
  not has_function_privilege('anon', 'public.list_my_correction_requests(integer)', 'EXECUTE'),
  'Anonymous callers cannot list collector notifications'
);
select ok(
  has_function_privilege('authenticated', 'public.count_my_unread_correction_requests()', 'EXECUTE'),
  'Collectors can count their unread correction notifications'
);
select ok(
  has_function_privilege('authenticated', 'public.mark_my_correction_requests_read()', 'EXECUTE'),
  'Collectors can mark their own correction notifications as read'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';

select lives_ok(
  $$ select * from public.admin_create_loan('92000000-0000-0000-0000-000000000001', 100, 20, 'daily', 6, '2026-10-31', '2026-10-31') $$,
  'Edit-request loan fixture is created'
);
select lives_ok(
  $$ select * from public.admin_create_loan('92000000-0000-0000-0000-000000000002', 120, 20, 'daily', 6, '2026-10-31', '2026-10-31') $$,
  'Payment-request loan fixture is created'
);
select lives_ok(
  $$ select * from public.admin_create_loan('92000000-0000-0000-0000-000000000003', 80, 10, 'weekly', 4, '2026-10-31', '2026-10-31') $$,
  'Loan-void fixture is created'
);
select lives_ok(
  $$ select * from public.admin_create_loan('92000000-0000-0000-0000-000000000004', 60, 0, 'monthly', 3, '2026-10-31', '2026-10-31') $$,
  'Posted-payment loan fixture is created'
);
select lives_ok(
  $$ select * from public.admin_create_loan('92000000-0000-0000-0000-000000000005', 70, 10, 'daily', 5, '2026-10-31', '2026-10-31') $$,
  'Other-portfolio loan fixture is created'
);

do $$
begin
  perform set_config(
    'test.correction_loan_a_id',
    (select id::text from public.loans where customer_id = '92000000-0000-0000-0000-000000000001'),
    true
  );
end;
$$;

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.create_correction_request(
      'edit_loan',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000001'),
      'The principal and installment count need correction',
      null,
      '{"principal": 105, "installmentCount": 7}'::jsonb
    )
  $$,
  'An active collector creates an edit request for their own portfolio'
);

select results_eq(
  $$
    select requested_by, reason, status::text
    from public.correction_requests
    where loan_id = (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000001')
      and request_type = 'edit_loan'
  $$,
  $$ values ('91000000-0000-0000-0000-000000000001'::uuid, 'The principal and installment count need correction'::text, 'pending'::text) $$,
  'Request creation derives immutable requester and pending lifecycle state'
);

select throws_ok(
  $$
    select * from public.create_correction_request(
      'edit_loan',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000001'),
      'Duplicate pending correction request'
    )
  $$,
  '23505',
  'A pending correction request already exists for this record and action',
  'A collector cannot create a duplicate pending request'
);

select lives_ok(
  $$
    select * from public.create_correction_request(
      'void_loan',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000001'),
      'The loan itself was registered by mistake'
    )
  $$,
  'Different correction actions may coexist for the same loan'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.create_correction_request(
      'void_loan',
      current_setting('test.correction_loan_a_id')::uuid,
      'Attempt against another portfolio'
    )
  $$,
  '42501',
  'Loan does not belong to the collector portfolio',
  'Collector B cannot request corrections for collector A portfolio'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000003';

select throws_ok(
  $$
    select * from public.create_correction_request(
      'void_loan',
      current_setting('test.correction_loan_a_id')::uuid,
      'Inactive collector attempt'
    )
  $$,
  '42501',
  'Only active collectors may create correction requests',
  'Inactive collectors cannot create requests'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';
select is((select count(*) from public.correction_requests), 0::bigint, 'Collector B cannot read collector A requests through RLS');

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select is((select count(*) from public.correction_requests), 2::bigint, 'Collector A can read their own requests');

select throws_ok(
  $$ select * from public.list_correction_requests() $$,
  '42501',
  'Only administrators or supervisors may review correction requests',
  'Collectors cannot call the administrative list RPC'
);
select throws_ok(
  $$ select public.count_pending_correction_requests() $$,
  '42501',
  'Only administrators or supervisors may review correction requests',
  'Collectors cannot call the administrative count RPC'
);
select throws_ok(
  $$
    select * from public.reject_correction_request(
      (select id from public.correction_requests where request_type = 'edit_loan'),
      'Collector rejection attempt'
    )
  $$,
  '42501',
  'Only administrators or supervisors may review correction requests',
  'Collectors cannot reject requests'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';

select results_eq(
  $$
    select customer_name, customer_document, collector_name, loan_frequency::text, loan_principal
    from public.list_correction_requests('pending', 100)
    where request_type = 'edit_loan'
  $$,
  $$ values ('Edit Request Customer'::text, '92000001'::text, 'Correction Collector A'::text, 'daily'::text, 100.00::numeric) $$,
  'Administrative listing includes customer, collector, loan, and request context'
);
select is(public.count_pending_correction_requests(), 2::bigint, 'Administrative pending count reflects current requests');

select lives_ok(
  $$
    select * from public.reject_correction_request(
      (select id from public.correction_requests where request_type = 'edit_loan'),
      'The submitted evidence does not justify an edit'
    )
  $$,
  'An administrator can reject a pending request'
);

reset role;

select results_eq(
  $$
    select status::text, handled_by, (handled_at is not null), resolution_note
    from public.correction_requests
    where request_type = 'edit_loan'
  $$,
  $$ values ('rejected'::text, '91000000-0000-0000-0000-000000000004'::uuid, true, 'The submitted evidence does not justify an edit'::text) $$,
  'Rejection records status, handler, timestamp, and reason'
);
select ok(
  exists (
    select 1 from private.audit_log al
    join public.correction_requests cr on cr.id = al.row_id
    where al.table_name = 'correction_requests'
      and cr.request_type = 'edit_loan'
      and al.actor_user_id = '91000000-0000-0000-0000-000000000004'
      and al.reason = 'The submitted evidence does not justify an edit'
      and al.old_data ->> 'status' = 'pending'
      and al.new_data ->> 'status' = 'rejected'
  ),
  'Request rejection keeps audited before/after lifecycle evidence'
);
select ok(
  exists (
    select 1 from private.audit_log al
    join public.correction_requests cr on cr.id = al.row_id
    where al.table_name = 'correction_requests'
      and cr.request_type = 'edit_loan'
      and al.old_data ->> 'loan_id' = al.new_data ->> 'loan_id'
      and al.old_data ->> 'requested_by' = al.new_data ->> 'requested_by'
      and al.old_data ->> 'request_type' = al.new_data ->> 'request_type'
  ),
  'Lifecycle handling preserves request identities'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$
    select * from public.create_correction_request(
      'edit_loan',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000001'),
      'Second edit request after the rejection'
    )
  $$,
  'A handled request no longer blocks a new request for the same action'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';
select lives_ok(
  $$
    select * from public.resolve_edit_loan_request(
      (select id from public.correction_requests where request_type = 'edit_loan' and status = 'pending'),
      105, 15, 'daily', 7, '2026-10-31', 'Approved correction of principal and terms'
    )
  $$,
  'Edit resolution reuses the audited administrative loan update atomically'
);

reset role;

select results_eq(
  $$
    select principal_amount, interest_rate_percent, installment_count::integer, first_due_on
    from public.loans where customer_id = '92000000-0000-0000-0000-000000000001'
  $$,
  $$ values (105.00::numeric, 15.0000::numeric, 7, '2026-11-02'::date) $$,
  'Edit resolution changes loan terms and derives the first due date centrally'
);
select is(
  (select status::text from public.correction_requests where request_type = 'edit_loan' and resolution_note = 'Approved correction of principal and terms'),
  'resolved'::text,
  'Edit request is marked resolved only after the loan edit succeeds'
);
select ok(
  exists (
    select 1 from private.audit_log al
    join public.loans l on l.id = al.row_id
    where al.table_name = 'loans'
      and l.customer_id = '92000000-0000-0000-0000-000000000001'
      and al.reason = 'Approved correction of principal and terms'
      and (al.new_data ->> 'principal_amount')::numeric = 105.00
  ),
  'Edit resolution preserves the existing loan audit trail'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$
    select * from public.register_payment(
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000002'),
      20, 'cash', '2026-10-31 15:00:00-05', 'Payment void fixture'
    )
  $$,
  'Payment fixture is registered through the production RPC'
);
select lives_ok(
  $$
    select * from public.create_correction_request(
      'void_payment',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000002'),
      'The customer payment was entered twice',
      (select id from public.payments where notes = 'Payment void fixture')
    )
  $$,
  'Collector requests voiding a posted payment from their portfolio'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';
select lives_ok(
  $$
    select * from public.resolve_void_payment_request(
      (select id from public.correction_requests where request_type = 'void_payment'),
      'Confirmed duplicate payment registration'
    )
  $$,
  'Payment resolution reuses void_payment in the request transaction'
);

reset role;

select is((select status::text from public.payments where notes = 'Payment void fixture'), 'voided'::text, 'Resolved payment is voided, never deleted');
select ok(
  exists (
    select 1 from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where p.notes = 'Payment void fixture'
  ),
  'Payment allocations remain as immutable history after voiding'
);
select ok(
  exists (
    select 1
    from public.cash_movements reversal
    join public.cash_movements original on original.id = reversal.reversal_of_id
    join public.payments p on p.id = original.payment_id
    where p.notes = 'Payment void fixture'
      and original.direction = 'inflow'
      and reversal.direction = 'outflow'
      and reversal.movement_type = 'payment_void'
      and reversal.amount = original.amount
  ),
  'Payment resolution retains the original cash movement and adds its linked reversal'
);
select is(
  (select status::text from public.correction_requests where request_type = 'void_payment'),
  'resolved'::text,
  'Payment request closes only after payment void succeeds'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$
    select * from public.create_correction_request(
      'void_loan',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000003'),
      'The loan was disbursed under the wrong customer'
    )
  $$,
  'Collector creates a loan void request for an unpaid active loan'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000005';
select lives_ok(
  $$
    select * from public.resolve_void_loan_request(
      (select cr.id from public.correction_requests cr join public.loans l on l.id = cr.loan_id where cr.request_type = 'void_loan' and l.customer_id = '92000000-0000-0000-0000-000000000003'),
      'Confirmed loan registration error'
    )
  $$,
  'A supervisor can void an unpaid loan and close its request atomically'
);

reset role;

select is((select status::text from public.loans where customer_id = '92000000-0000-0000-0000-000000000003'), 'voided'::text, 'Loan voiding changes status instead of deleting history');
select is(
  (select count(*) from public.installments i join public.loans l on l.id = i.loan_id where l.customer_id = '92000000-0000-0000-0000-000000000003'),
  4::bigint,
  'Loan voiding preserves every installment row'
);
select is(
  (select count(*) from public.installments i join public.loans l on l.id = i.loan_id where l.customer_id = '92000000-0000-0000-0000-000000000003' and i.superseded_at is not null),
  4::bigint,
  'Loan voiding supersedes every active installment'
);
select ok(
  exists (
    select 1 from public.cash_movements reversal
    join public.cash_movements original on original.id = reversal.reversal_of_id
    join public.loans l on l.id = original.loan_id
    where l.customer_id = '92000000-0000-0000-0000-000000000003'
      and original.movement_type = 'loan_disbursement'
      and original.direction = 'outflow'
      and reversal.movement_type = 'loan_void'
      and reversal.direction = 'inflow'
      and reversal.amount = original.amount
  ),
  'Loan voiding adds an audited counter-movement linked to the original disbursement'
);
select is(
  (select count(*) from public.cash_movements cm join public.loans l on l.id = cm.loan_id where l.customer_id = '92000000-0000-0000-0000-000000000003' and cm.movement_type = 'loan_disbursement'),
  1::bigint,
  'Original loan disbursement remains immutable after reversal'
);
select ok(
  exists (
    select 1 from private.audit_log al
    join public.loans l on l.id = al.row_id
    where al.table_name = 'loans'
      and l.customer_id = '92000000-0000-0000-0000-000000000003'
      and al.actor_user_id = '91000000-0000-0000-0000-000000000005'
      and al.reason = 'Confirmed loan registration error'
      and al.old_data ->> 'status' = 'active'
      and al.new_data ->> 'status' = 'voided'
  ),
  'Loan void keeps actor, reason, and before/after audit evidence'
);
select results_eq(
  $$
    select cr.status::text, cr.handled_by
    from public.correction_requests cr
    join public.loans l on l.id = cr.loan_id
    where cr.request_type = 'void_loan'
      and l.customer_id = '92000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('resolved'::text, '91000000-0000-0000-0000-000000000005'::uuid) $$,
  'Loan void request records the supervisor who resolved it'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
select lives_ok(
  $$
    select * from public.register_payment(
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000004'),
      10, 'cash', '2026-10-31 16:00:00-05', 'Posted payment blocks loan void'
    )
  $$,
  'Posted payment fixture is registered'
);
select lives_ok(
  $$
    select * from public.create_correction_request(
      'void_loan',
      (select id from public.loans where customer_id = '92000000-0000-0000-0000-000000000004'),
      'Request requiring payment-history review'
    )
  $$,
  'Collector may submit a void request for administrative review even when payments exist'
);

set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000004';
select throws_ok(
  $$
    select * from public.resolve_void_loan_request(
      (select cr.id from public.correction_requests cr join public.loans l on l.id = cr.loan_id where cr.request_type = 'void_loan' and l.customer_id = '92000000-0000-0000-0000-000000000004'),
      'Unsafe approval attempt with posted payment'
    )
  $$,
  '22023',
  'Loans with posted payments cannot be voided',
  'Loan void resolution refuses active posted payment history'
);

reset role;

select is(
  (select cr.status::text from public.correction_requests cr join public.loans l on l.id = cr.loan_id where cr.request_type = 'void_loan' and l.customer_id = '92000000-0000-0000-0000-000000000004'),
  'pending'::text,
  'Failed financial resolution rolls back and leaves the request pending'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000005';
select lives_ok(
  $$
    select * from public.reject_correction_request(
      (select cr.id from public.correction_requests cr join public.loans l on l.id = cr.loan_id where cr.request_type = 'void_loan' and l.customer_id = '92000000-0000-0000-0000-000000000004'),
      'Loan has a posted payment and cannot be voided'
    )
  $$,
  'Supervisor rejects an unsafe void request with an auditable reason'
);
select is(public.count_pending_correction_requests(), 1::bigint, 'Only the earlier independent pending request remains');

select throws_ok(
  $$
    update public.correction_requests
    set requested_by = '91000000-0000-0000-0000-000000000005'
    where request_type = 'void_payment'
  $$,
  '42501',
  'permission denied for table correction_requests',
  'Even a supervisor cannot mutate request identities directly'
);

reset role;

select throws_ok(
  $$
    delete from public.correction_requests
    where request_type = 'void_payment'
  $$,
  'P0001',
  'physical deletion is not allowed for correction_requests',
  'Request history cannot be physically deleted even by a privileged SQL actor'
);

select is((select count(*) from public.correction_requests), 6::bigint, 'All request identities and lifecycle history remain persisted');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.list_my_correction_requests(100)),
  (select count(*) from public.correction_requests where requested_by = auth.uid()),
  'Collector notification list contains every request created by that collector'
);
select is(
  public.count_my_unread_correction_requests(),
  (
    select count(*)
    from public.correction_requests
    where requested_by = auth.uid()
      and status in ('resolved', 'rejected')
  ),
  'Unread count includes resolved and rejected requests only'
);
select is(
  public.mark_my_correction_requests_read(),
  (
    select count(*)
    from public.correction_requests
    where requested_by = auth.uid()
      and status in ('resolved', 'rejected')
  ),
  'Collector marks every resolved notification as read once'
);
select is(
  public.count_my_unread_correction_requests(),
  0::bigint,
  'No unread correction notifications remain after marking them read'
);

reset role;

select is(
  (select count(*) from public.correction_request_reads where user_id = '91000000-0000-0000-0000-000000000001'),
  (
    select count(*)
    from public.correction_requests
    where requested_by = '91000000-0000-0000-0000-000000000001'
      and status in ('resolved', 'rejected')
  ),
  'Read receipts remain scoped to the requesting collector'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from public.list_my_correction_requests(100)),
  0::bigint,
  'Another collector cannot list the first collector notifications'
);
select is(
  public.count_my_unread_correction_requests(),
  0::bigint,
  'Another collector receives no unread notification count'
);

reset role;

select * from finish();

rollback;
