begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- ============================================================
-- USUARIOS DE PRUEBA
-- ============================================================

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'cobrador.a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'cobrador.b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'supervisor@test.local'),
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
    '33333333-3333-3333-3333-333333333333',
    '10000003',
    'Supervisor',
    'supervisor',
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '10000004',
    'Administrador',
    'admin',
    true
  );

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
-- COBRADOR A
-- ============================================================

set local role authenticated;

set local request.jwt.claim.sub =
  '11111111-1111-1111-1111-111111111111';

select results_eq(
  'select count(*) from public.customers',
  array[1::bigint],
  'El cobrador A solo puede ver los clientes de su propia cartera'
);

select results_eq(
  $$
    select count(*)
    from public.customers
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  $$,
  array[0::bigint],
  'El cobrador A no puede ver los clientes asignados al cobrador B'
);

select is_empty(
  $$
    update public.customers
    set full_name = 'Cliente alterado'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    returning id
  $$,
  'El cobrador A no puede modificar directamente los clientes'
);

-- ============================================================
-- COBRADOR B
-- ============================================================

set local request.jwt.claim.sub =
  '22222222-2222-2222-2222-222222222222';

select results_eq(
  'select count(*) from public.customers',
  array[1::bigint],
  'El cobrador B solo puede ver los clientes de su propia cartera'
);

-- ============================================================
-- SUPERVISOR
-- ============================================================

set local request.jwt.claim.sub =
  '33333333-3333-3333-3333-333333333333';

select results_eq(
  'select count(*) from public.customers',
  array[2::bigint],
  'El supervisor puede ver los clientes de todas las carteras'
);

-- ============================================================
-- ADMINISTRADOR
-- ============================================================

set local request.jwt.claim.sub =
  '44444444-4444-4444-4444-444444444444';

select results_eq(
  'select count(*) from public.customers',
  array[2::bigint],
  'El administrador puede ver todos los clientes'
);

select lives_ok(
  $$
    update public.customers
    set full_name = 'Cliente A actualizado'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  $$,
  'El administrador puede modificar clientes'
);

select * from finish();

rollback;
