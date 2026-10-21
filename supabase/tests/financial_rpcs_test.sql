begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- ============================================================
-- DATOS DE PRUEBA
-- ============================================================

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'cobrador.a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'cobrador.b@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'admin@test.local');

insert into public.profiles (
  id,
  dni,
  full_name,
  role,
  active
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '10000001',
    'Cobrador A',
    'collector',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '10000002',
    'Cobrador B',
    'collector',
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '10000004',
    'Administrador',
    'admin',
    true
  );

-- ============================================================
-- CLIENTES
-- ============================================================

insert into public.customers (
  id,
  document_number,
  full_name,
  collector_id,
  created_by
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '70000001',
    'Cliente A',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '70000002',
    'Cliente B',
    '22222222-2222-2222-2222-222222222222',
    '44444444-4444-4444-4444-444444444444'
  );

-- ============================================================
-- PRÉSTAMOS
-- ============================================================

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
values
  (
    'aaaaaaaa-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    100.00,
    20.0000,
    120.00,
    100.00,
    2,
    'weekly',
    current_date,
    current_date + 7,
    'active',
    '44444444-4444-4444-4444-444444444444'
  ),
  (
    'bbbbbbbb-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    50.00,
    20.0000,
    60.00,
    50.00,
    1,
    'weekly',
    current_date,
    current_date + 7,
    'active',
    '44444444-4444-4444-4444-444444444444'
  );

-- ============================================================
-- CUOTAS
-- ============================================================

insert into public.installments (
  id,
  loan_id,
  installment_number,
  due_date,
  scheduled_amount
)
values
  (
    'aaaaaaaa-aaaa-1111-1111-111111111111',
    'aaaaaaaa-1111-1111-1111-111111111111',
    1,
    current_date + 7,
    60.00
  ),
  (
    'aaaaaaaa-aaaa-2222-2222-222222222222',
    'aaaaaaaa-1111-1111-1111-111111111111',
    2,
    current_date + 14,
    60.00
  ),
  (
    'bbbbbbbb-bbbb-1111-1111-111111111111',
    'bbbbbbbb-1111-1111-1111-111111111111',
    1,
    current_date + 7,
    60.00
  );

-- ============================================================
-- AUTENTICAR COMO COBRADOR A
-- ============================================================

set local role authenticated;

set local request.jwt.claim.sub =
  '11111111-1111-1111-1111-111111111111';


-- ============================================================
-- TEST 1
-- No puede cobrar cartera de otro cobrador
-- ============================================================

select throws_ok(
  $$
    select *
    from public.register_payment(
      'bbbbbbbb-1111-1111-1111-111111111111'::uuid,
      20.00,
      'cash'
    )
  $$,
  '42501',
  'Collector cannot register payments for another portfolio',
  'El cobrador no puede registrar pagos en la cartera de otro cobrador'
);


-- ============================================================
-- TEST 2
-- No puede cobrar más que el saldo pendiente
-- ============================================================

select throws_ok(
  $$
    select *
    from public.register_payment(
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
      130.00,
      'cash'
    )
  $$,
  '22023',
  'Payment exceeds outstanding loan balance',
  'No se puede registrar un pago mayor al saldo pendiente'
);


-- ============================================================
-- TEST 3
-- Registrar pago válido
-- ============================================================

select lives_ok(
  $$
    select *
    from public.register_payment(
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
      120.00,
      'cash'
    )
  $$,
  'Se puede registrar correctamente un pago válido'
);


-- ============================================================
-- TEST 4
-- Se creó exactamente un pago
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.payments
    where loan_id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
  $$,
  array[1::bigint],
  'El pago queda registrado una sola vez'
);


-- ============================================================
-- TEST 5
-- El pago quedó publicado
-- ============================================================

select results_eq(
  $$
    select status::text
    from public.payments
    where loan_id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
  $$,
  array['posted'::text],
  'El pago queda registrado con estado posted'
);


-- ============================================================
-- TEST 6
-- El pago se distribuyó entre las dos cuotas
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.payment_allocations pa
    join public.payments p
      on p.id = pa.payment_id
    where p.loan_id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
  $$,
  array[2::bigint],
  'El pago total se distribuye entre todas las cuotas pendientes'
);


-- ============================================================
-- TEST 7
-- Se generó el movimiento de caja
-- ============================================================

select results_eq(
  $$
    select count(*)
    from public.cash_movements
    where loan_id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
      and movement_type = 'collection'
      and direction = 'inflow'
  $$,
  array[1::bigint],
  'Registrar un pago genera su correspondiente movimiento de caja'
);


-- ============================================================
-- TEST 8
-- El préstamo queda pagado
-- ============================================================

select results_eq(
  $$
    select status::text
    from public.loans
    where id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
  $$,
  array['paid'::text],
  'El préstamo queda pagado cuando el saldo llega a cero'
);


-- ============================================================
-- AUTENTICAR COMO ADMINISTRADOR
-- ============================================================

set local request.jwt.claim.sub =
  '44444444-4444-4444-4444-444444444444';


-- ============================================================
-- TEST 9
-- El administrador puede cobrar una cartera ajena
-- ============================================================

select lives_ok(
  $$
    select *
    from public.register_payment(
      'bbbbbbbb-1111-1111-1111-111111111111'::uuid,
      20.00,
      'cash',
      now(),
      'Pago recibido por administración'
    )
  $$,
  'El administrador puede registrar pagos para cualquier cartera'
);


-- ============================================================
-- TEST 10
-- El pago conserva al cobrador asignado y audita al administrador
-- ============================================================

select results_eq(
  $$
    select
      collector_id,
      created_by
    from public.payments
    where loan_id =
      'bbbbbbbb-1111-1111-1111-111111111111'::uuid
  $$,
  $$ values (
    '22222222-2222-2222-2222-222222222222'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid
  ) $$,
  'El pago administrativo conserva la cartera y registra al actor real'
);


-- ============================================================
-- TEST 11
-- Anulación de pago
-- ============================================================

select lives_ok(
  $$
    select *
    from public.void_payment(
      (
        select id
        from public.payments
        where loan_id =
          'aaaaaaaa-1111-1111-1111-111111111111'::uuid
        limit 1
      ),
      'Anulación de prueba'
    )
  $$,
  'El administrador puede anular un pago correctamente'
);


-- ============================================================
-- TEST 12
-- El pago no se elimina: queda voided
-- ============================================================

select results_eq(
  $$
    select status::text
    from public.payments
    where loan_id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
  $$,
  array['voided'::text],
  'Un pago anulado conserva su registro y queda con estado voided'
);


-- ============================================================
-- TEST 13
-- El préstamo vuelve a quedar activo
-- ============================================================

select results_eq(
  $$
    select status::text
    from public.loans
    where id =
      'aaaaaaaa-1111-1111-1111-111111111111'::uuid
  $$,
  array['active'::text],
  'Al anular el pago total el préstamo vuelve a quedar activo'
);


select * from finish();

rollback;
