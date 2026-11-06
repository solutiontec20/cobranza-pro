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

select plan(27);

select set_config(
  'cobranzapro_test.today',
  ((now() at time zone 'America/Lima')::date)::text,
  false
);

insert into auth.users (id, email)
values
  ('96100000-0000-0000-0000-000000000001', 'allowance.collector.a@test.local'),
  ('96100000-0000-0000-0000-000000000002', 'allowance.admin@test.local'),
  ('96100000-0000-0000-0000-000000000003', 'allowance.supervisor@test.local'),
  ('96100000-0000-0000-0000-000000000004', 'allowance.collector.b@test.local');

insert into public.profiles (id, dni, full_name, role, active, must_change_pin)
values
  ('96100000-0000-0000-0000-000000000001', '96100001', 'Allowance Collector A', 'collector', true, false),
  ('96100000-0000-0000-0000-000000000002', '96100002', 'Allowance Administrator', 'admin', true, false),
  ('96100000-0000-0000-0000-000000000003', '96100003', 'Allowance Supervisor', 'supervisor', true, false),
  ('96100000-0000-0000-0000-000000000004', '96100004', 'Allowance Collector B', 'collector', true, false);

select ok(
  not has_function_privilege(
    'anon',
    'public.request_cash_allowance(date,numeric,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot request allowances'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.request_cash_allowance(date,numeric,text)',
    'EXECUTE'
  ),
  'Authenticated callers may request allowances subject to role checks'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.review_cash_allowance_request(uuid,boolean,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot review allowance requests'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.review_cash_allowance_request(uuid,boolean,text)',
    'EXECUTE'
  ),
  'Authenticated callers may review allowance requests subject to role checks'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.register_cash_allowance(uuid,date,numeric,text)',
    'EXECUTE'
  ),
  'Authenticated callers cannot bypass the request workflow'
);

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'cash_allowance_requests'
  ),
  'RLS is enabled on cash_allowance_requests'
);

set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date,
      40,
      'Movilidad para la ruta'
    )
  $$,
  'Collector A can request an allowance for today'
);

select results_eq(
  $$
    select collector_id, amount, notes, status, requested_by
    from public.cash_allowance_requests
    where collector_id = '96100000-0000-0000-0000-000000000001'
  $$,
  $$
    values (
      '96100000-0000-0000-0000-000000000001'::uuid,
      40.00::numeric,
      'Movilidad para la ruta'::text,
      'pending'::public.cash_allowance_request_status,
      '96100000-0000-0000-0000-000000000001'::uuid
    )
  $$,
  'The request preserves amount, notes, status, and requester identity'
);

select throws_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date,
      20,
      'Solicitud duplicada'
    )
  $$,
  '23505',
  'A pending allowance request already exists for this business date',
  'Only one pending allowance request is allowed per collector and date'
);

select throws_ok(
  $$
    insert into public.cash_allowance_requests (
      collector_id, business_date, amount, requested_by
    )
    values (
      '96100000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date,
      5,
      '96100000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'Collectors cannot insert allowance requests directly'
);

select throws_ok(
  $$
    select * from public.review_cash_allowance_request(
      (
        select id from public.cash_allowance_requests
        where collector_id = '96100000-0000-0000-0000-000000000001'
      ),
      true,
      null
    )
  $$,
  '42501',
  'Only administrators or supervisors may review allowance requests',
  'Collectors cannot approve their own allowance request'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date,
      10,
      'Admin request'
    )
  $$,
  '42501',
  'Only collectors may request an allowance',
  'Administrators cannot originate an allowance request'
);

select lives_ok(
  $$
    select * from public.review_cash_allowance_request(
      (
        select id from public.cash_allowance_requests
        where collector_id = '96100000-0000-0000-0000-000000000001'
      ),
      true,
      null
    )
  $$,
  'An administrator can approve the pending allowance request'
);

select results_eq(
  $$
    select status, reviewed_by, (cash_movement_id is not null)
    from public.cash_allowance_requests
    where collector_id = '96100000-0000-0000-0000-000000000001'
  $$,
  $$
    values (
      'approved'::public.cash_allowance_request_status,
      '96100000-0000-0000-0000-000000000002'::uuid,
      true
    )
  $$,
  'Approval records the reviewer and linked cash movement'
);

select results_eq(
  $$
    select cm.collector_id, cm.direction, cm.movement_type, cm.amount, cm.created_by
    from public.cash_movements cm
    join public.cash_allowance_requests car on car.cash_movement_id = cm.id
    where car.collector_id = '96100000-0000-0000-0000-000000000001'
  $$,
  $$
    values (
      '96100000-0000-0000-0000-000000000001'::uuid,
      'inflow'::public.cash_direction,
      'allowance'::text,
      40.00::numeric,
      '96100000-0000-0000-0000-000000000002'::uuid
    )
  $$,
  'Approval atomically creates the correct allowance inflow'
);

select is(
  private.collector_expected_cash(
    '96100000-0000-0000-0000-000000000001',
    current_setting('cobranzapro_test.today')::date
  ),
  40.00::numeric,
  'Approved allowance increases expected cash by its amount'
);

select throws_ok(
  $$
    select * from public.review_cash_allowance_request(
      (
        select id from public.cash_allowance_requests
        where collector_id = '96100000-0000-0000-0000-000000000001'
      ),
      true,
      null
    )
  $$,
  '22023',
  'Only pending allowance requests may be reviewed',
  'An approved request cannot be reviewed twice'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date,
      15,
      'Segundo viático'
    )
  $$,
  'A collector may create a new request after the prior request was reviewed'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000003';

select throws_ok(
  $$
    select * from public.review_cash_allowance_request(
      (
        select id from public.cash_allowance_requests
        where collector_id = '96100000-0000-0000-0000-000000000001'
          and status = 'pending'
      ),
      false,
      null
    )
  $$,
  '22023',
  'A rejection reason is required',
  'A supervisor must provide a reason when rejecting a request'
);

select lives_ok(
  $$
    select * from public.review_cash_allowance_request(
      (
        select id from public.cash_allowance_requests
        where collector_id = '96100000-0000-0000-0000-000000000001'
          and status = 'pending'
      ),
      false,
      'El monto no corresponde a la ruta'
    )
  $$,
  'A supervisor can reject a pending request with a reason'
);

select results_eq(
  $$
    select status, reviewed_by, rejection_reason, cash_movement_id
    from public.cash_allowance_requests
    where collector_id = '96100000-0000-0000-0000-000000000001'
      and amount = 15
  $$,
  $$
    values (
      'rejected'::public.cash_allowance_request_status,
      '96100000-0000-0000-0000-000000000003'::uuid,
      'El monto no corresponde a la ruta'::text,
      null::uuid
    )
  $$,
  'Rejection records its reviewer and reason without creating a cash movement'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000004';

select is(
  (
    select count(*) from public.cash_allowance_requests
    where collector_id = '96100000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'Collector B cannot see collector A allowance requests'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.cash_allowance_requests),
  2::bigint,
  'Collector A sees both of their own reviewed requests'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000002';

select is(
  (select count(*) from public.cash_allowance_requests),
  2::bigint,
  'Administrators see allowance requests across portfolios'
);

reset role;

insert into public.cash_closures (
  collector_id,
  business_date,
  expected_amount,
  delivered_amount,
  status,
  submitted_at,
  validated_at,
  validated_by,
  created_by
)
values (
  '96100000-0000-0000-0000-000000000004',
  current_setting('cobranzapro_test.today')::date,
  0,
  0,
  'validated',
  now(),
  now(),
  '96100000-0000-0000-0000-000000000002',
  '96100000-0000-0000-0000-000000000004'
);

set local role authenticated;
set local request.jwt.claim.sub = '96100000-0000-0000-0000-000000000004';

select throws_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date,
      10,
      'Solicitud después del cierre'
    )
  $$,
  '22023',
  'Cannot request an allowance once the cash closure has been validated',
  'A validated closure blocks new allowance requests'
);

select throws_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date - 1,
      10,
      'Solicitud histórica'
    )
  $$,
  '22023',
  'Allowances may only be requested for the current business date',
  'Collectors cannot request allowances for a historical date'
);

select throws_ok(
  $$
    select * from public.request_cash_allowance(
      current_setting('cobranzapro_test.today')::date,
      10.001,
      'Monto con demasiados decimales'
    )
  $$,
  '22023',
  'Allowance amount may contain at most two decimals',
  'Allowance amounts are limited to two decimal places'
);

reset role;

select * from finish();

rollback;
