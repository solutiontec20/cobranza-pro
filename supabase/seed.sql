-- ============================================================
-- COBRANZAPRO - LOCAL SEED DATA
-- ============================================================
-- Runs automatically on `supabase db reset` / `supabase db start`
-- (see supabase/config.toml -> [db.seed]).
--
-- Purpose:
-- - Give every role (admin, supervisor, collector) a real,
--   working DNI + PIN login against the LOCAL stack, so manual
--   QA and Playwright E2E specs can authenticate through the
--   actual /login screen (not just call RPCs directly).
-- - Cover the confirmed business scenarios from REQUERIMIENTO.md:
--   full payment, partial payment, advance payment, mild overdue,
--   automatic blacklist (>5 days), fully paid loan, a customer
--   with no loan yet, a voided/corrected payment, and a daily
--   cash closure (submit + validate).
-- - Prove portfolio isolation: collector A and collector B each
--   get their own customers.
--
-- All names/DNIs below are FICTIONAL. No real customer data from
-- any operational report is used here.
--
-- IMPORTANT — auth.users / auth.identities shape:
-- These two tables belong to Supabase's own Auth (GoTrue) schema,
-- not to this repo's migrations. The INSERT statements below use
-- the current GoTrue table shape (Supabase CLI 2.119, Postgres 17
-- per supabase/config.toml). If a future CLI/GoTrue upgrade changes
-- that schema, login may fail even though this seed runs without
-- SQL errors — if so, compare these columns against
-- `\d auth.users` / `\d auth.identities` in the local stack.
--
-- IMPORTANT — this seed uses SQL-only session variables through
-- set_config()/current_setting(). It intentionally avoids psql
-- meta-commands such as \gset so Supabase CLI can execute the file
-- through its SQL batch seeding path in local development and CI.
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
-- pgcrypto is normally already bootstrapped by the Supabase
-- platform itself; this is just defensive.

create extension if not exists pgcrypto with schema extensions;


-- ============================================================
-- 0.1 "TODAY", IN LIMA TIME
-- ============================================================
-- Every RPC in this schema (register_payment, submit_cash_closure,
-- validate_cash_closure) and both derived views
-- (installment_balances, customer_financial_status) compute
-- "today" as `(now() at time zone 'America/Lima')::date` — not the
-- session's plain `CURRENT_DATE`, which depends on the Postgres session's
-- TimeZone setting (often UTC in a fresh local container and
-- therefore NOT the same calendar day as Lima at certain hours).
-- Capture the Lima date once here and reuse it everywhere below,
-- so this seed's "due today"/"overdue" math can never silently
-- disagree with what the RPCs themselves compute.

select set_config(
  'cobranzapro_seed.today_lima',
  ((now() at time zone 'America/Lima')::date)::text,
  false
);


-- ============================================================
-- 1. TEST USERS (admin, supervisor, 3 collectors)
-- ============================================================
-- PIN for every seeded user: 123456
-- (Intentionally simple for local QA. isWeakPin() would reject
-- this if someone tried to set it again through the real
-- change-pin flow — that check lives in the Edge Function layer,
-- not in the database, so it does not block this seed.)
--
-- | Role       | DNI      | Full name               | Notes                              |
-- |------------|----------|--------------------------|-------------------------------------|
-- | admin      | 10000001 | Admin Demo               |                                      |
-- | supervisor | 10000002 | Supervisor Demo          |                                      |
-- | collector  | 20000001 | Marco Rivas Delgado      | Portfolio A                          |
-- | collector  | 20000002 | Daniela Soto Paredes     | Portfolio B                          |
-- | collector  | 20000003 | Jorge Paredes Luna       | must_change_pin = true (forced flow)|

-- Explicit auth.users inserts (one per test identity).

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    '10000001@auth.cobranzapro.local',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    '10000002@auth.cobranzapro.local',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000011',
    'authenticated',
    'authenticated',
    '20000001@auth.cobranzapro.local',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000012',
    'authenticated',
    'authenticated',
    '20000002@auth.cobranzapro.local',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000013',
    'authenticated',
    'authenticated',
    '20000003@auth.cobranzapro.local',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  );


-- Matching auth.identities rows (email provider).
-- `email` is a generated column in current GoTrue schemas — never
-- insert it explicitly.

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', '10000001@auth.cobranzapro.local'),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', '10000002@auth.cobranzapro.local'),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000011',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000011', 'email', '20000001@auth.cobranzapro.local'),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000012',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000012', 'email', '20000002@auth.cobranzapro.local'),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000013',
    '00000000-0000-0000-0000-000000000013',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000013', 'email', '20000003@auth.cobranzapro.local'),
    'email',
    now(), now(), now()
  );


-- admin / supervisor profiles: inserted directly (no RPC exists
-- for this — admin_create_collector_profile only creates
-- collectors).

insert into public.profiles (
  id, dni, full_name, role, active, must_change_pin
)
values
  ('00000000-0000-0000-0000-000000000001', '10000001', 'Admin Demo', 'admin', true, false),
  ('00000000-0000-0000-0000-000000000002', '10000002', 'Supervisor Demo', 'supervisor', true, false);


-- Collectors: created through the real RPC, simulating the admin
-- actor the same way supabase/tests/*.sql already does, so the
-- audit trail and validation match production exactly.

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin

select public.admin_create_collector_profile(
  p_user_id => '00000000-0000-0000-0000-000000000011',
  p_dni => '20000001',
  p_full_name => 'Marco Rivas Delgado',
  p_phone => '987654321'
);

select public.admin_create_collector_profile(
  p_user_id => '00000000-0000-0000-0000-000000000012',
  p_dni => '20000002',
  p_full_name => 'Daniela Soto Paredes',
  p_phone => '987654322'
);

select public.admin_create_collector_profile(
  p_user_id => '00000000-0000-0000-0000-000000000013',
  p_dni => '20000003',
  p_full_name => 'Jorge Paredes Luna',
  p_phone => '987654323'
);

commit;

-- Jorge Paredes Luna (collector C) must change his temporary PIN
-- on first login — covers the "must_change_pin" forced-flow case.
update public.profiles
set must_change_pin = true
where id = '00000000-0000-0000-0000-000000000013';


-- ============================================================
-- 2. CUSTOMERS
-- ============================================================
-- Portfolio A (Marco Rivas Delgado, 20000001)

insert into public.customers (
  id, document_number, full_name, phone, address, collector_id, created_by, active
)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    '30000001',
    'Rosa Delia Huaman Ponce',
    '911111111',
    'Jr. Las Flores 123, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    '30000002',
    'Jorge Luis Castillo Vera',
    '911111112',
    'Av. Grau 456, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    '30000003',
    'Diana Patricia Reyes Soto',
    '911111113',
    'Calle Union 789, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    '30000004',
    'Jose Antonio Vargas Lima',
    '911111114',
    'Jr. Tacna 321, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    '30000005',
    'Flor Elizabeth Campos Diaz',
    '911111115',
    'Av. Bolognesi 654, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000006',
    '30000006',
    'Ricardo Fabian Nunez Ortiz',
    '911111116',
    'Calle Real 987, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000007',
    '30000007',
    'Carla Beatriz Salinas Vega',
    '911111117',
    'Jr. Progreso 159, Chiclayo',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    true
  );

-- Portfolio B (Daniela Soto Paredes, 20000002)

insert into public.customers (
  id, document_number, full_name, phone, address, collector_id, created_by, active
)
values
  (
    'b0000000-0000-0000-0000-000000000001',
    '30000011',
    'Hugo Martin Delgado Rios',
    '922222221',
    'Av. Peru 111, Trujillo',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    '30000012',
    'Patricia Noemi Flores Chavez',
    '922222222',
    'Jr. Ayacucho 222, Trujillo',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    true
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    '30000013',
    'Elena Sofia Paredes Luna',
    '922222223',
    'Calle Lima 333, Trujillo',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    true
  );


-- ============================================================
-- 3. LOANS + PAYMENTS (via the real RPCs)
-- ============================================================
-- Every loan is created through public.admin_create_loan (as the
-- admin actor) and every payment through public.register_payment,
-- exactly like the application does. This guarantees the
-- generated schedules, rounding, cash ledger and loan status
-- transitions are 100% consistent with production logic instead
-- of being hand-forged.
--
-- "Due today" amounts are computed by querying the installments
-- the RPC itself generated, instead of guessing schedule dates by
-- hand (daily schedules skip Sundays, so hand math is error-prone).


-- ------------------------------------------------------------
-- 3.1 Rosa Delia Huaman Ponce — on_track (paid up to today)
-- Daily, 9 days of history, default 20% rate.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin

select set_config('cobranzapro_seed.c1_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'a0000000-0000-0000-0000-000000000001',
  p_principal => 300,
  p_interest_rate => 20,
  p_frequency => 'daily',
  p_installment_count => 24,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 9,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 9
);

commit;

select set_config(
  'cobranzapro_seed.c1_due_today',
  coalesce(sum(scheduled_amount), 0)::text,
  false
)
from public.installments
where loan_id = current_setting('cobranzapro_seed.c1_loan_id')::uuid
  and due_date <= current_setting('cobranzapro_seed.today_lima')::date;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin pays on behalf; collector_id on the ledger stays Marco's

select set_config('cobranzapro_seed.c1_payment_id', payment_id::text, false)
from public.register_payment(
  p_loan_id => current_setting('cobranzapro_seed.c1_loan_id')::uuid,
  p_amount => current_setting('cobranzapro_seed.c1_due_today')::numeric,
  p_payment_method => 'cash',
  p_notes => 'Pago al dia (seed)'
);

commit;


-- ------------------------------------------------------------
-- 3.2 Jorge Luis Castillo Vera — partial payment (shortfall)
-- Weekly, 3 installments already due; pays less than due today.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c2_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'a0000000-0000-0000-0000-000000000002',
  p_principal => 400,
  p_interest_rate => 20,
  p_frequency => 'weekly',
  p_installment_count => 10,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 21,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 21
);

commit;

select set_config('cobranzapro_seed.c2_first_installment', scheduled_amount::text, false)
from public.installments
where loan_id = current_setting('cobranzapro_seed.c2_loan_id')::uuid
order by installment_number
limit 1;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c2_payment_id', payment_id::text, false)
from public.register_payment(
  p_loan_id => current_setting('cobranzapro_seed.c2_loan_id')::uuid,
  p_amount => round(current_setting('cobranzapro_seed.c2_first_installment')::numeric / 2, 2),
  p_payment_method => 'yape',
  p_notes => 'Pago parcial (seed) - deja saldo pendiente para la siguiente fecha'
);

commit;


-- ------------------------------------------------------------
-- 3.3 Diana Patricia Reyes Soto — advance payment
-- Daily, pays due-today plus two future installments at once.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c3_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'a0000000-0000-0000-0000-000000000003',
  p_principal => 250,
  p_interest_rate => 20,
  p_frequency => 'daily',
  p_installment_count => 20,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 9,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 9
);

commit;

select set_config(
  'cobranzapro_seed.c3_advance_amount',
  (
    coalesce(
      (
        select sum(scheduled_amount)
        from public.installments
        where loan_id = current_setting('cobranzapro_seed.c3_loan_id')::uuid
          and due_date <= current_setting('cobranzapro_seed.today_lima')::date
      ), 0
    ) + coalesce(
      (
        select sum(scheduled_amount)
        from (
          select scheduled_amount
          from public.installments
          where loan_id = current_setting('cobranzapro_seed.c3_loan_id')::uuid
            and due_date > current_setting('cobranzapro_seed.today_lima')::date
          order by installment_number
          limit 2
        ) next_two
      ), 0
    )
  )::text,
  false
);

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c3_payment_id', payment_id::text, false)
from public.register_payment(
  p_loan_id => current_setting('cobranzapro_seed.c3_loan_id')::uuid,
  p_amount => current_setting('cobranzapro_seed.c3_advance_amount')::numeric,
  p_payment_method => 'cash',
  p_notes => 'Pago adelantado (seed) - cubre hoy + 2 cuotas futuras'
);

commit;


-- ------------------------------------------------------------
-- 3.4 Jose Antonio Vargas Lima — mild overdue (<=5 days)
-- Monthly, 15% rate, no payment registered.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c4_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'a0000000-0000-0000-0000-000000000004',
  p_principal => 500,
  p_interest_rate => 15,
  p_frequency => 'monthly',
  p_installment_count => 6,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 3,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 3
);

commit;


-- ------------------------------------------------------------
-- 3.5 Flor Elizabeth Campos Diaz — blacklisted (>5 days overdue)
-- Daily, no payment registered since the loan started.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c5_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'a0000000-0000-0000-0000-000000000005',
  p_principal => 200,
  p_interest_rate => 20,
  p_frequency => 'daily',
  p_installment_count => 15,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 20,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 20
);

commit;


-- ------------------------------------------------------------
-- 3.6 Ricardo Fabian Nunez Ortiz — fully paid loan
-- Weekly, single installment, pays the whole total at once.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select
  set_config('cobranzapro_seed.c6_loan_id', id::text, false),
  set_config('cobranzapro_seed.c6_total', total_amount::text, false)
from public.admin_create_loan(
  p_customer_id => 'a0000000-0000-0000-0000-000000000006',
  p_principal => 150,
  p_interest_rate => 20,
  p_frequency => 'weekly',
  p_installment_count => 1,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 10,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 10
);

commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c6_payment_id', payment_id::text, false)
from public.register_payment(
  p_loan_id => current_setting('cobranzapro_seed.c6_loan_id')::uuid,
  p_amount => current_setting('cobranzapro_seed.c6_total')::numeric,
  p_payment_method => 'cash',
  p_notes => 'Cancelacion total (seed)'
);

commit;

-- 3.7 Carla Beatriz Salinas Vega intentionally has NO loan: she is
-- the customer to use when testing "crear nuevo prestamo".


-- ------------------------------------------------------------
-- 3.8 Hugo Martin Delgado Rios (Portfolio B) — on_track
-- Mirrors 3.1, under collector B, to verify portfolio isolation.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c8_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'b0000000-0000-0000-0000-000000000001',
  p_principal => 300,
  p_interest_rate => 20,
  p_frequency => 'daily',
  p_installment_count => 24,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 9,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 9
);

commit;

select set_config(
  'cobranzapro_seed.c8_due_today',
  coalesce(sum(scheduled_amount), 0)::text,
  false
)
from public.installments
where loan_id = current_setting('cobranzapro_seed.c8_loan_id')::uuid
  and due_date <= current_setting('cobranzapro_seed.today_lima')::date;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c8_payment_id', payment_id::text, false)
from public.register_payment(
  p_loan_id => current_setting('cobranzapro_seed.c8_loan_id')::uuid,
  p_amount => current_setting('cobranzapro_seed.c8_due_today')::numeric,
  p_payment_method => 'cash',
  p_notes => 'Pago al dia (seed, portafolio B)'
);

commit;


-- ------------------------------------------------------------
-- 3.9 Patricia Noemi Flores Chavez (Portfolio B) — blacklisted
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c9_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'b0000000-0000-0000-0000-000000000002',
  p_principal => 350,
  p_interest_rate => 30,
  p_frequency => 'weekly',
  p_installment_count => 8,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 28,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 28
);

commit;


-- ------------------------------------------------------------
-- 3.10 Elena Sofia Paredes Luna (Portfolio B) — voided payment
-- Demonstrates section 8 of REQUERIMIENTO.md: a posted payment
-- is never deleted, only voided with a reason, and the loan
-- reopens automatically if it had been marked as paid.
-- ------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c10_loan_id', id::text, false)
from public.admin_create_loan(
  p_customer_id => 'b0000000-0000-0000-0000-000000000003',
  p_principal => 300,
  p_interest_rate => 20,
  p_frequency => 'daily',
  p_installment_count => 10,
  p_started_on => current_setting('cobranzapro_seed.today_lima')::date - 9,
  p_first_due_on => current_setting('cobranzapro_seed.today_lima')::date - 9
);

commit;

select set_config(
  'cobranzapro_seed.c10_due_today',
  coalesce(sum(scheduled_amount), 0)::text,
  false
)
from public.installments
where loan_id = current_setting('cobranzapro_seed.c10_loan_id')::uuid
  and due_date <= current_setting('cobranzapro_seed.today_lima')::date;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select set_config('cobranzapro_seed.c10_payment_id', payment_id::text, false)
from public.register_payment(
  p_loan_id => current_setting('cobranzapro_seed.c10_loan_id')::uuid,
  p_amount => current_setting('cobranzapro_seed.c10_due_today')::numeric,
  p_payment_method => 'cash',
  p_notes => 'Pago a anular (seed)'
);

commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin voids the payment

select set_config('cobranzapro_seed.c10_voided_payment_id', payment_id::text, false)
from public.void_payment(
  p_payment_id => current_setting('cobranzapro_seed.c10_payment_id')::uuid,
  p_reason => 'Error de registro detectado por el cobrador (seed)'
);

commit;


-- ============================================================
-- 4. DAILY CASH CLOSURE (submit + validate)
-- ============================================================
-- Collector C (Jorge Paredes Luna) has no seeded customers, loans,
-- disbursements or payments. That makes today's expected cash amount
-- exactly zero, which is a valid closure scenario and avoids mixing
-- historical demo loans (whose disbursement cash movements are created
-- today by the real RPC) into the same cash-closing day.
--
-- This still exercises the real production flow end-to-end:
-- collector submits today's closure -> PostgreSQL calculates expected=0
-- -> delivered=0 is stored -> admin validates the closure.

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013'; -- Jorge Paredes Luna (collector C)

select set_config('cobranzapro_seed.cash_closure_id', closure_id::text, false)
from public.submit_cash_closure(
  p_business_date => current_setting('cobranzapro_seed.today_lima')::date,
  p_delivered_amount => 0,
  p_observation => 'Cierre sin movimientos del dia (seed)'
);

commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin validates

select set_config('cobranzapro_seed.cash_closure_validated_id', closure_id::text, false)
from public.validate_cash_closure(
  p_closure_id => current_setting('cobranzapro_seed.cash_closure_id')::uuid,
  p_observation => 'Cierre sin movimientos verificado (seed)'
);

commit;


-- ============================================================
-- 5. SUMMARY
-- ============================================================

do $$
begin
  raise notice '============================================================';
  raise notice 'CobranzaPro local seed loaded.';
  raise notice 'Test logins (DNI / PIN 123456):';
  raise notice '  admin        10000001';
  raise notice '  supervisor   10000002';
  raise notice '  collector A  20000001  (Marco Rivas Delgado - portafolio A)';
  raise notice '  collector B  20000002  (Daniela Soto Paredes - portafolio B)';
  raise notice '  collector C  20000003  (Jorge Paredes Luna - debe cambiar PIN)';
  raise notice 'See supabase/SEED.md for the full scenario-by-scenario breakdown.';
  raise notice '============================================================';
end $$;
