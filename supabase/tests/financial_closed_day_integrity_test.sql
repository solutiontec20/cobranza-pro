begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select set_config(
  'app.test_business_timestamp',
  (
    (
      (now() at time zone 'America/Lima')::date + time '12:00:00'
    ) at time zone 'America/Lima'
  )::text,
  true
);

select set_config(
  'cobranzapro_test.today',
  ((now() at time zone 'America/Lima')::date)::text,
  false
);

insert into auth.users (id, email)
values
  ('99100000-0000-0000-0000-000000000001', 'closed-day.collector.a@test.local'),
  ('99100000-0000-0000-0000-000000000002', 'closed-day.admin@test.local'),
  ('99100000-0000-0000-0000-000000000003', 'closed-day.collector.b@test.local');

insert into public.profiles (id, dni, full_name, role, active, must_change_pin)
values
  (
    '99100000-0000-0000-0000-000000000001',
    '99100001',
    'Closed Day Collector A',
    'collector',
    true,
    false
  ),
  (
    '99100000-0000-0000-0000-000000000002',
    '99100002',
    'Closed Day Administrator',
    'admin',
    true,
    false
  ),
  (
    '99100000-0000-0000-0000-000000000003',
    '99100003',
    'Closed Day Collector B',
    'collector',
    true,
    false
  );

insert into public.customers (
  id,
  document_number,
  full_name,
  address,
  collector_id,
  created_by,
  active
)
values
  (
    '99200000-0000-0000-0000-000000000001',
    '99200001',
    'Closed Day Customer With Loan',
    'Test address 1',
    '99100000-0000-0000-0000-000000000001',
    '99100000-0000-0000-0000-000000000002',
    true
  ),
  (
    '99200000-0000-0000-0000-000000000002',
    '99200002',
    'Closed Day Loanless Customer',
    'Test address 2',
    '99100000-0000-0000-0000-000000000001',
    '99100000-0000-0000-0000-000000000002',
    true
  );

-- Direct fixtures avoid introducing a disbursement into the cash-day total.
insert into public.loans (
  id,
  customer_id,
  principal_amount,
  interest_rate_percent,
  total_amount,
  disbursed_amount,
  installment_count,
  frequency,
  started_on,
  first_due_on,
  status,
  created_by
)
values (
  '99300000-0000-0000-0000-000000000001',
  '99200000-0000-0000-0000-000000000001',
  100,
  0,
  100,
  100,
  1,
  'daily',
  current_setting('cobranzapro_test.today')::date,
  current_setting('cobranzapro_test.today')::date,
  'active',
  '99100000-0000-0000-0000-000000000002'
);

insert into public.installments (loan_id, installment_number, due_date, scheduled_amount)
values (
  '99300000-0000-0000-0000-000000000001',
  1,
  current_setting('cobranzapro_test.today')::date,
  100
);

-- FIN-002: the collector-provided timestamp is ignored.
set local role authenticated;
set local request.jwt.claim.sub = '99100000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.register_payment(
      '99300000-0000-0000-0000-000000000001',
      10,
      'cash',
      '2000-01-01 08:00:00-05'::timestamptz,
      'Attacker-controlled timestamp must be ignored'
    )
  $$,
  'A collector may register a payment while the cash day is open'
);

reset role;

select is(
  (
    select p.paid_at
    from public.payments p
    where p.loan_id = '99300000-0000-0000-0000-000000000001'
  ),
  transaction_timestamp(),
  'Collector payments use the authoritative server timestamp'
);

select is(
  (
    select p.business_date
    from public.payments p
    where p.loan_id = '99300000-0000-0000-0000-000000000001'
  ),
  current_setting('cobranzapro_test.today')::date,
  'Collector payment business date is derived from the server timestamp in Lima'
);

select results_eq(
  $$
    select cm.occurred_at, cm.business_date
    from public.cash_movements cm
    where cm.payment_id = (
      select p.id
      from public.payments p
      where p.loan_id = '99300000-0000-0000-0000-000000000001'
    )
  $$,
  $$
    select p.paid_at, p.business_date
    from public.payments p
    where p.loan_id = '99300000-0000-0000-0000-000000000001'
  $$,
  'Payment and cash ledger use the same authoritative timestamp and business date'
);

-- Close and validate today's cash day with the registered cash collection.
set local role authenticated;
set local request.jwt.claim.sub = '99100000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select * from public.submit_cash_closure(
      current_setting('cobranzapro_test.today')::date,
      10,
      null
    )
  $$,
  'Collector submits the current cash closure'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99100000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    select * from public.validate_cash_closure(
      (
        select cc.id
        from public.cash_closures cc
        where cc.collector_id = '99100000-0000-0000-0000-000000000001'
          and cc.business_date = current_setting('cobranzapro_test.today')::date
      ),
      null
    )
  $$,
  'Administrator validates the current cash closure'
);

reset role;

-- FIN-001: every ledger path is blocked after validation.
set local role authenticated;
set local request.jwt.claim.sub = '99100000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.register_payment(
      '99300000-0000-0000-0000-000000000001',
      5,
      'cash',
      now(),
      'Must not post after validation'
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'Collector cannot register a payment after validating the cash day'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99100000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    select * from public.register_payment(
      '99300000-0000-0000-0000-000000000001',
      5,
      'cash',
      now(),
      'Admin must not bypass a validated cash day'
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'Administrator cannot register a payment into a validated cash day'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99100000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select * from public.collector_create_loan(
      '99200000-0000-0000-0000-000000000002',
      50,
      10,
      'daily',
      2,
      current_setting('cobranzapro_test.today')::date
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'Collector cannot disburse a loan after validating the cash day'
);

reset role;

select is(
  (
    select count(*)
    from public.loans l
    where l.customer_id = '99200000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'Rejected disbursement rolls back the loan atomically'
);

select throws_ok(
  $$
    update public.cash_movements
    set notes = 'Tampered after validation'
    where payment_id = (
      select p.id
      from public.payments p
      where p.loan_id = '99300000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'A cash movement in a validated day cannot be modified'
);

select throws_ok(
  $$
    delete from public.cash_movements
    where payment_id = (
      select p.id
      from public.payments p
      where p.loan_id = '99300000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'A cash movement in a validated day cannot be deleted'
);

select lives_ok(
  $$
    insert into public.cash_movements (
      collector_id,
      direction,
      movement_type,
      amount,
      occurred_at,
      business_date,
      notes,
      created_by
    )
    values (
      '99100000-0000-0000-0000-000000000003',
      'inflow',
      'adjustment',
      1,
      now(),
      current_setting('cobranzapro_test.today')::date,
      'Open day movement',
      '99100000-0000-0000-0000-000000000002'
    )
  $$,
  'A movement may still be registered for another open cash day'
);

select throws_ok(
  $$
    update public.cash_movements
    set collector_id = '99100000-0000-0000-0000-000000000001'
    where collector_id = '99100000-0000-0000-0000-000000000003'
      and notes = 'Open day movement'
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'An open-day movement cannot be moved into a validated cash day'
);

select throws_ok(
  $$
    update public.cash_movements
    set collector_id = '99100000-0000-0000-0000-000000000003'
    where payment_id = (
      select p.id
      from public.payments p
      where p.loan_id = '99300000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'A movement cannot be moved out of a validated cash day'
);

select throws_ok(
  $$
    insert into public.cash_movements (
      collector_id,
      direction,
      movement_type,
      amount,
      occurred_at,
      business_date,
      notes,
      created_by
    )
    values (
      '99100000-0000-0000-0000-000000000001',
      'inflow',
      'adjustment',
      1,
      now(),
      current_setting('cobranzapro_test.today')::date,
      'Must be rejected',
      '99100000-0000-0000-0000-000000000002'
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'Direct ledger inserts cannot bypass a validated cash day'
);

select * from finish();

rollback;
