begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

-- Anchor every date in this test to the current Lima business date, so the
-- suite never depends on the wall-clock time it happens to run at (mirrors
-- the "future date" guards in register_cash_opening/allowance/expense and
-- submit_cash_closure, which compare against `(now() at time zone
-- 'America/Lima')::date`).
select set_config(
  'cobranzapro_test.today',
  ((now() at time zone 'America/Lima')::date)::text,
  false
);

insert into auth.users (id, email)
values
  ('96000000-0000-0000-0000-000000000001', 'cash-closure.collector.a@test.local'),
  ('96000000-0000-0000-0000-000000000002', 'cash-closure.admin@test.local'),
  ('96000000-0000-0000-0000-000000000003', 'cash-closure.collector.b@test.local'),
  ('96000000-0000-0000-0000-000000000004', 'cash-closure.collector.d@test.local');

insert into public.profiles (id, dni, full_name, role, active, must_change_pin)
values
  ('96000000-0000-0000-0000-000000000001', '96000001', 'Cash Closure Collector A', 'collector', true, false),
  ('96000000-0000-0000-0000-000000000002', '96000002', 'Cash Closure Administrator', 'admin', true, false),
  ('96000000-0000-0000-0000-000000000003', '96000003', 'Cash Closure Collector B', 'collector', true, false),
  -- Collector D has a pending PIN change, exactly like a freshly reset
  -- collector account: private.current_app_role() must resolve to NULL
  -- for them, regression-testing the bug fixed in
  -- 20261025140000_cash_closure_operational_profile_guard.sql (a NULL
  -- role used to either silently bypass the check or fall back to the
  -- confusing generic "no tenés permisos" message).
  ('96000000-0000-0000-0000-000000000004', '96000004', 'Cash Closure Collector D (pending PIN change)', 'collector', true, true);

insert into public.customers (id, document_number, full_name, address, collector_id, created_by, active)
values
  (
    '97000000-0000-0000-0000-000000000001',
    '97000001',
    'Cash Closure Customer',
    'Test address 1',
    '96000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000002',
    true
  ),
  (
    '97000000-0000-0000-0000-000000000002',
    '97000002',
    'Cash Closure Loanless Customer',
    'Test address 2',
    '96000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000002',
    true
  );

-- A loan with an installment, inserted directly (bypassing admin_create_loan
-- / collector_create_loan on purpose): those RPCs always disburse the
-- principal as an additional cash outflow, which would pollute this test's
-- expected-cash math. This mirrors the same direct-insert pattern used in
-- financial_rpcs_test.sql for fixtures that only need to exist, not to have
-- gone through the disbursement flow.
insert into public.loans (
  id, customer_id, principal_amount, interest_rate_percent, total_amount,
  disbursed_amount, installment_count, frequency, started_on, first_due_on,
  status, created_by
)
values (
  '98000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000001',
  2000, 0, 2000, 2000, 1, 'daily',
  current_setting('cobranzapro_test.today')::date,
  current_setting('cobranzapro_test.today')::date,
  'active', '96000000-0000-0000-0000-000000000002'
);

insert into public.installments (loan_id, installment_number, due_date, scheduled_amount)
values (
  '98000000-0000-0000-0000-000000000001', 1,
  current_setting('cobranzapro_test.today')::date, 2000
);

-- ------------------------------------------------------------
-- Function privileges
-- ------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon',
    'public.register_cash_opening(uuid,date,numeric,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot execute register_cash_opening'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.register_cash_opening(uuid,date,numeric,text)',
    'EXECUTE'
  ),
  'Authenticated callers may execute register_cash_opening subject to in-function authorization'
);

-- A bare `create view` only grants SELECT to its owner, not to
-- `authenticated` — regression test for the bug fixed in
-- 20261025150000_grant_cash_day_breakdown_select.sql (both admin and
-- collector screens load this view first on every page load, so a
-- missing grant here manifested as a generic "no tenés permisos" for
-- every role, not just a specific action).
select ok(
  has_table_privilege(
    'authenticated',
    'public.collector_cash_day_breakdown',
    'SELECT'
  ),
  'Authenticated callers may select from the cash day breakdown view'
);

-- ------------------------------------------------------------
-- Role guards
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select throws_ok(
  $$
    select * from public.register_cash_opening(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date,
      1000, null
    )
  $$,
  '42501',
  'Only administrators or supervisors may register an opening float',
  'A collector cannot register their own opening float'
);

reset role;

-- ------------------------------------------------------------
-- 1. Admin registers opening float (apertura) = 1000
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000002'; -- admin

select lives_ok(
  $$
    select * from public.register_cash_opening(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date,
      1000, 'Apertura del dia'
    )
  $$,
  'Admin registers the opening float for collector A'
);

select throws_ok(
  $$
    select * from public.register_cash_opening(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date,
      500, null
    )
  $$,
  '23505',
  'Opening float has already been registered for this collector and date',
  'A second opening float for the same collector and day is rejected'
);

-- ------------------------------------------------------------
-- 2. Admin registers allowance (viaticos) = 100
-- ------------------------------------------------------------

select lives_ok(
  $$
    select * from public.register_cash_allowance(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date,
      100, 'Viaticos del dia'
    )
  $$,
  'Admin registers the allowance for collector A'
);

reset role;

select is(
  (
    select private.collector_expected_cash(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date
    )
  ),
  1100.00::numeric,
  'Expected cash after opening + allowance is 1000 + 100'
);

-- ------------------------------------------------------------
-- 3. Collections: 650 in cash, 200 in yape (yape must NOT affect cash)
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select lives_ok(
  $$
    select * from public.register_payment(
      '98000000-0000-0000-0000-000000000001',
      650, 'cash',
      (current_setting('cobranzapro_test.today')::date::text || ' 12:00:00')::timestamp at time zone 'America/Lima'
    )
  $$,
  'Collector registers a cash collection of 650'
);

select lives_ok(
  $$
    select * from public.register_payment(
      '98000000-0000-0000-0000-000000000001',
      200, 'yape',
      (current_setting('cobranzapro_test.today')::date::text || ' 12:05:00')::timestamp at time zone 'America/Lima'
    )
  $$,
  'Collector registers a yape collection of 200 (digital, not physical cash)'
);

reset role;

select is(
  (
    select private.collector_expected_cash(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date
    )
  ),
  1750.00::numeric,
  'Expected cash only grows by the cash collection (1100 + 650), yape is excluded'
);

-- ------------------------------------------------------------
-- 4. New loan disbursed in cash = 600 (reduces cash, not an expense)
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select lives_ok(
  $$
    select * from public.collector_create_loan(
      '97000000-0000-0000-0000-000000000002', 600, 10, 'daily', 3,
      current_setting('cobranzapro_test.today')::date
    )
  $$,
  'Collector disburses a new loan in cash to a different, loanless customer'
);

reset role;

select is(
  (
    select private.collector_expected_cash(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date
    )
  ),
  1150.00::numeric,
  'Expected cash drops by the cash disbursement (1750 - 600)'
);

-- ------------------------------------------------------------
-- 5. Operating expense: fuel 50, requested and approved
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select lives_ok(
  $$
    select * from public.request_cash_expense(
      current_setting('cobranzapro_test.today')::date,
      'fuel', 50, 'Combustible para la ruta'
    )
  $$,
  'Collector requests a fuel expense of 50'
);

reset role;

select is(
  (
    select private.collector_expected_cash(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date
    )
  ),
  1150.00::numeric,
  'A pending expense does not change expected cash yet'
);

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000002'; -- admin

select lives_ok(
  $$
    select * from public.review_cash_expense(
      (
        select ce.id from public.cash_expenses ce
        where ce.collector_id = '96000000-0000-0000-0000-000000000001'
          and ce.category = 'fuel'
      ),
      true, null
    )
  $$,
  'Admin approves the fuel expense'
);

reset role;

select is(
  (
    select private.collector_expected_cash(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date
    )
  ),
  1100.00::numeric,
  'Approving the fuel expense reduces expected cash by 50 (matches the worked example: 1100)'
);

-- ------------------------------------------------------------
-- 6. A rejected expense never reduces expected cash
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select lives_ok(
  $$
    select * from public.request_cash_expense(
      current_setting('cobranzapro_test.today')::date,
      'meals', 30, 'Almuerzo no autorizado'
    )
  $$,
  'Collector requests a meals expense of 30'
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000002'; -- admin

select throws_ok(
  $$
    select * from public.review_cash_expense(
      (
        select ce.id from public.cash_expenses ce
        where ce.collector_id = '96000000-0000-0000-0000-000000000001'
          and ce.category = 'meals'
      ),
      false, null
    )
  $$,
  '22023',
  'A rejection reason is required',
  'Rejecting an expense without a reason is blocked'
);

select lives_ok(
  $$
    select * from public.review_cash_expense(
      (
        select ce.id from public.cash_expenses ce
        where ce.collector_id = '96000000-0000-0000-0000-000000000001'
          and ce.category = 'meals'
      ),
      false, 'Gasto no autorizado por el supervisor'
    )
  $$,
  'Admin rejects the meals expense with a reason'
);

reset role;

select is(
  (
    select private.collector_expected_cash(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date
    )
  ),
  1100.00::numeric,
  'A rejected expense never reduced expected cash — still 1100'
);

select is(
  (
    select ce.cash_movement_id from public.cash_expenses ce
    where ce.collector_id = '96000000-0000-0000-0000-000000000001'
      and ce.category = 'meals'
  ),
  null::uuid,
  'The rejected expense has no linked cash movement'
);

select throws_ok(
  $$
    select * from public.review_cash_expense(
      (
        select ce.id from public.cash_expenses ce
        where ce.collector_id = '96000000-0000-0000-0000-000000000001'
          and ce.category = 'meals'
      ),
      true, null
    )
  $$,
  '22023',
  'Only pending expenses may be reviewed',
  'A already-reviewed expense cannot be reviewed again'
);

-- ------------------------------------------------------------
-- 7. Breakdown view matches the worked example exactly
-- ------------------------------------------------------------

select results_eq(
  $$
    select
      opening_amount, allowance_amount, cash_collected_amount,
      yape_collected_amount, loan_disbursement_amount, operating_expense_amount
    from public.collector_cash_day_breakdown
    where collector_id = '96000000-0000-0000-0000-000000000001'
      and business_date = current_setting('cobranzapro_test.today')::date
  $$,
  $$
    values (
      1000.00::numeric, 100.00::numeric, 650.00::numeric,
      200.00::numeric, 600.00::numeric, 50.00::numeric
    )
  $$,
  'The breakdown view reports every category exactly as in the worked example'
);

-- The check above runs as the superuser psql/pgTAP connection, which
-- bypasses GRANT checks entirely and would not have caught the missing
-- `grant select ... to authenticated` on the view. Repeat it end-to-end
-- as the actual `authenticated` role collector A uses in production, to
-- regression-test 20261025150000_grant_cash_day_breakdown_select.sql.
set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select results_eq(
  $$
    select cash_collected_amount
    from public.collector_cash_day_breakdown
    where collector_id = '96000000-0000-0000-0000-000000000001'
      and business_date = current_setting('cobranzapro_test.today')::date
  $$,
  $$ values (650.00::numeric) $$,
  'Collector A can select their own row from the breakdown view as the authenticated role'
);

reset role;

-- ------------------------------------------------------------
-- 8. Submitting without an observation when there is a difference is blocked
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000001'; -- collector A

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_setting('cobranzapro_test.today')::date,
      1200, null
    )
  $$,
  '22023',
  'An observation is required when the delivered amount differs from the expected amount',
  'Delivering more than expected without an observation is blocked'
);

select lives_ok(
  $$
    select * from public.submit_cash_closure(
      current_setting('cobranzapro_test.today')::date,
      1200, 'Entregue de mas por un abono adicional en campo'
    )
  $$,
  'Delivering more than expected with an observation succeeds'
);

reset role;

select results_eq(
  $$
    select expected_amount, delivered_amount, difference_amount, status
    from public.cash_closures
    where collector_id = '96000000-0000-0000-0000-000000000001'
      and business_date = current_setting('cobranzapro_test.today')::date
  $$,
  $$
    values (
      1100.00::numeric, 1200.00::numeric, 100.00::numeric,
      'submitted'::public.cash_closure_status
    )
  $$,
  'The closure records a 100 surplus and stays submitted until validated'
);

-- ------------------------------------------------------------
-- 9. Admin validates the closure
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000002'; -- admin

select lives_ok(
  $$
    select * from public.validate_cash_closure(
      (
        select cc.id from public.cash_closures cc
        where cc.collector_id = '96000000-0000-0000-0000-000000000001'
          and cc.business_date = current_setting('cobranzapro_test.today')::date
      ),
      null
    )
  $$,
  'Admin validates the submitted closure'
);

reset role;

select results_eq(
  $$
    select status from public.cash_closures
    where collector_id = '96000000-0000-0000-0000-000000000001'
      and business_date = current_setting('cobranzapro_test.today')::date
  $$,
  array['validated'::public.cash_closure_status],
  'The closure is now validated'
);

-- ------------------------------------------------------------
-- 10. Once validated, no further cash movements can be registered that day
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000002'; -- admin

select throws_ok(
  $$
    select * from public.register_cash_allowance(
      '96000000-0000-0000-0000-000000000001',
      current_setting('cobranzapro_test.today')::date,
      20, null
    )
  $$,
  '22023',
  'Cannot register cash movements once the cash closure has been validated',
  'Cash movements are locked once the closure is validated'
);

reset role;

-- ------------------------------------------------------------
-- 11. A collector only sees their own cash_expenses (RLS)
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000003'; -- collector B (unrelated)

select is(
  (
    select count(*) from public.cash_expenses
    where collector_id = '96000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'Collector B cannot see collector A cash expenses'
);

select throws_ok(
  $$
    select * from public.request_cash_expense(
      current_setting('cobranzapro_test.today')::date,
      'other', 10, null,
      '96000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'Collector cannot request an expense for another portfolio',
  'Collector B cannot request an expense on behalf of collector A'
);

reset role;

-- ------------------------------------------------------------
-- 12. A collector pending a PIN change gets a clear, specific error
-- instead of a silently-bypassed check or the generic "no permission"
-- message (regression test for the operational-profile guard fix).
-- ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '96000000-0000-0000-0000-000000000004'; -- collector D (pending PIN change)

select throws_ok(
  $$
    select * from public.request_cash_expense(
      current_setting('cobranzapro_test.today')::date,
      'fuel', 10, null
    )
  $$,
  '42501',
  'Active application profile required',
  'A collector pending a PIN change cannot request an expense'
);

select throws_ok(
  $$
    select * from public.submit_cash_closure(
      current_setting('cobranzapro_test.today')::date,
      0, null
    )
  $$,
  '42501',
  'Active application profile required',
  'A collector pending a PIN change cannot submit their cash closure'
);

reset role;

select is(
  (
    select count(*) from public.cash_expenses
    where collector_id = '96000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'No expense was created for the non-operational collector (no silent bypass)'
);

select is(
  (
    select count(*) from public.cash_closures
    where collector_id = '96000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'No cash closure was created for the non-operational collector (no silent bypass)'
);

select * from finish();

rollback;
