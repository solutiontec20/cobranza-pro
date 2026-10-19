-- ============================================================
-- COBRANZAPRO - INITIAL DATABASE SCHEMA
-- ============================================================
-- PostgreSQL / Supabase
--
-- Convenciones:
-- - UUID para entidades públicas.
-- - numeric(12,2) para importes monetarios.
-- - timestamptz para instantes.
-- - date para fechas operativas.
-- - RLS obligatorio.
-- - No eliminación física de información financiera.
-- - Lógica financiera crítica mediante RPC/transacciones.
-- ============================================================


-- ============================================================
-- 1. PRIVATE SCHEMA
-- ============================================================

create schema if not exists private;

revoke all on schema private from public;

grant usage on schema private to authenticated;


-- ============================================================
-- 2. DOMAIN TYPES
-- ============================================================

create type public.app_role as enum (
  'admin',
  'supervisor',
  'collector'
);

create type public.loan_frequency as enum (
  'daily',
  'weekly',
  'monthly'
);

create type public.loan_status as enum (
  'active',
  'paid',
  'renewed',
  'voided'
);

create type public.payment_status as enum (
  'posted',
  'voided'
);

create type public.cash_direction as enum (
  'inflow',
  'outflow'
);

create type public.cash_closure_status as enum (
  'draft',
  'submitted',
  'validated'
);


-- ============================================================
-- 3. PROFILES
-- ============================================================

create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete restrict,

  dni text not null
    constraint profiles_dni_format_chk
    check (dni ~ '^[0-9]{8}$'),

  full_name text not null,

  role public.app_role not null,

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_dni_unique
    unique (dni)
);

create index profiles_role_active_idx
  on public.profiles (role, active);


-- ============================================================
-- 4. CUSTOMERS
-- ============================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),

  document_number text not null,
  full_name text not null,

  phone text,
  address text,
  notes text,

  collector_id uuid not null
    references public.profiles(id)
    on delete restrict,

  active boolean not null default true,

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_document_unique
    unique (document_number)
);

create index customers_collector_idx
  on public.customers (collector_id);

create index customers_active_idx
  on public.customers (active);


-- ============================================================
-- 5. LOANS
-- ============================================================

create table public.loans (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null
    references public.customers(id)
    on delete restrict,

  previous_loan_id uuid
    references public.loans(id)
    on delete restrict,

  principal_amount numeric(12,2) not null
    constraint loans_principal_positive_chk
    check (principal_amount > 0),

  interest_rate_percent numeric(7,4) not null
    constraint loans_interest_non_negative_chk
    check (interest_rate_percent >= 0),

  total_amount numeric(12,2) not null
    constraint loans_total_positive_chk
    check (total_amount > 0),

  -- Dinero realmente entregado al cliente.
  -- En una renovación puede ser menor al principal porque
  -- parte del nuevo préstamo cancela saldo anterior.
  disbursed_amount numeric(12,2) not null
    constraint loans_disbursed_valid_chk
    check (
      disbursed_amount >= 0
      and disbursed_amount <= principal_amount
    ),

  installment_count smallint not null
    constraint loans_installment_count_chk
    check (installment_count > 0),

  frequency public.loan_frequency not null,

  started_on date not null,
  first_due_on date not null,

  status public.loan_status not null default 'active',

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  closed_at timestamptz,
  close_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint loans_total_ge_principal_chk
    check (total_amount >= principal_amount),

  constraint loans_previous_different_chk
    check (previous_loan_id is null or previous_loan_id <> id)
);

create index loans_customer_idx
  on public.loans (customer_id);

create index loans_status_idx
  on public.loans (status);

create index loans_created_at_idx
  on public.loans (created_at desc);


-- Un cliente solo puede tener un préstamo activo.
create unique index loans_one_active_per_customer_idx
  on public.loans (customer_id)
  where status = 'active';


-- Un préstamo anterior no puede generar dos renovaciones distintas.
create unique index loans_previous_loan_unique_idx
  on public.loans (previous_loan_id)
  where previous_loan_id is not null;


-- ============================================================
-- 6. INSTALLMENTS
-- ============================================================

create table public.installments (
  id uuid primary key default gen_random_uuid(),

  loan_id uuid not null
    references public.loans(id)
    on delete restrict,

  installment_number smallint not null
    constraint installments_number_positive_chk
    check (installment_number > 0),

  due_date date not null,

  scheduled_amount numeric(12,2) not null
    constraint installments_amount_positive_chk
    check (scheduled_amount > 0),

  created_at timestamptz not null default now(),

  constraint installments_number_unique
    unique (loan_id, installment_number),

  constraint installments_due_date_unique
    unique (loan_id, due_date)
);

create index installments_loan_idx
  on public.installments (loan_id);

create index installments_due_date_idx
  on public.installments (due_date);


-- ============================================================
-- 7. PAYMENTS
-- ============================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  loan_id uuid not null
    references public.loans(id)
    on delete restrict,

  -- Cobrador al cual se atribuye esta cobranza.
  collector_id uuid not null
    references public.profiles(id)
    on delete restrict,

  amount numeric(12,2) not null
    constraint payments_amount_positive_chk
    check (amount > 0),

  -- Flexible inicialmente: cash, yape, etc.
  -- Cuando confirmemos todos los canales podemos normalizarlo.
  payment_method text not null,

  paid_at timestamptz not null default now(),

  -- Día operativo del negocio en Lima.
  business_date date not null
    default ((now() at time zone 'America/Lima')::date),

  status public.payment_status not null default 'posted',

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  corrected_from_payment_id uuid
    references public.payments(id)
    on delete restrict,

  voided_at timestamptz,

  voided_by uuid
    references public.profiles(id)
    on delete restrict,

  void_reason text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_void_consistency_chk
    check (
      (
        status = 'posted'
        and voided_at is null
        and voided_by is null
        and void_reason is null
      )
      or
      (
        status = 'voided'
        and voided_at is not null
        and voided_by is not null
        and void_reason is not null
      )
    )
);

create index payments_loan_idx
  on public.payments (loan_id);

create index payments_collector_business_date_idx
  on public.payments (collector_id, business_date);

create index payments_business_date_idx
  on public.payments (business_date);

create index payments_paid_at_idx
  on public.payments (paid_at desc);

create index payments_status_idx
  on public.payments (status);

create unique index payments_single_correction_idx
  on public.payments (corrected_from_payment_id)
  where corrected_from_payment_id is not null;


-- ============================================================
-- 8. PAYMENT ALLOCATIONS
-- ============================================================
-- Un pago puede cubrir:
-- - una cuota,
-- - varias cuotas,
-- - una cuota parcialmente.
--
-- Esto evita guardar "paid_amount" duplicado en installments.
-- ============================================================

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),

  payment_id uuid not null
    references public.payments(id)
    on delete restrict,

  installment_id uuid not null
    references public.installments(id)
    on delete restrict,

  amount numeric(12,2) not null
    constraint payment_allocations_amount_positive_chk
    check (amount > 0),

  created_at timestamptz not null default now(),

  constraint payment_allocations_unique
    unique (payment_id, installment_id)
);

create index payment_allocations_payment_idx
  on public.payment_allocations (payment_id);

create index payment_allocations_installment_idx
  on public.payment_allocations (installment_id);


-- ============================================================
-- 9. CASH MOVEMENTS
-- ============================================================
-- Ledger operativo de caja.
--
-- Ejemplos:
-- collection        -> entrada
-- loan_disbursement -> salida
-- refund            -> salida
-- adjustment        -> entrada/salida
-- ============================================================

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),

  collector_id uuid not null
    references public.profiles(id)
    on delete restrict,

  customer_id uuid
    references public.customers(id)
    on delete restrict,

  loan_id uuid
    references public.loans(id)
    on delete restrict,

  payment_id uuid
    references public.payments(id)
    on delete restrict,

  direction public.cash_direction not null,

  movement_type text not null,

  amount numeric(12,2) not null
    constraint cash_movements_amount_positive_chk
    check (amount > 0),

  payment_method text,

  occurred_at timestamptz not null default now(),

  business_date date not null
    default ((now() at time zone 'America/Lima')::date),

  notes text,

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cash_movements_collector_date_idx
  on public.cash_movements (
    collector_id,
    business_date
  );

create index cash_movements_loan_idx
  on public.cash_movements (loan_id);

create index cash_movements_payment_idx
  on public.cash_movements (payment_id);

create index cash_movements_business_date_idx
  on public.cash_movements (business_date);

create unique index cash_movements_payment_unique_idx
  on public.cash_movements (payment_id)
  where payment_id is not null;


-- ============================================================
-- 10. CASH CLOSURES
-- ============================================================

create table public.cash_closures (
  id uuid primary key default gen_random_uuid(),

  collector_id uuid not null
    references public.profiles(id)
    on delete restrict,

  business_date date not null,

  expected_amount numeric(12,2) not null
    constraint cash_closures_expected_non_negative_chk
    check (expected_amount >= 0),

  delivered_amount numeric(12,2) not null
    constraint cash_closures_delivered_non_negative_chk
    check (delivered_amount >= 0),

  difference_amount numeric(12,2)
    generated always as (
      delivered_amount - expected_amount
    ) stored,

  status public.cash_closure_status
    not null
    default 'draft',

  observation text,

  submitted_at timestamptz,

  validated_at timestamptz,

  validated_by uuid
    references public.profiles(id)
    on delete restrict,

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cash_closures_collector_date_unique
    unique (collector_id, business_date)
);

create index cash_closures_business_date_idx
  on public.cash_closures (business_date);

create index cash_closures_status_idx
  on public.cash_closures (status);


-- ============================================================
-- 11. PRIVATE AUDIT LOG
-- ============================================================
-- No se expone directamente mediante Data API.
-- ============================================================

create table private.audit_log (
  id bigint generated always as identity primary key,

  table_name text not null,

  row_id uuid not null,

  actor_user_id uuid,

  action text not null
    constraint audit_log_action_chk
    check (action in ('UPDATE')),

  reason text,

  old_data jsonb,
  new_data jsonb,

  created_at timestamptz not null default now()
);

create index audit_log_row_idx
  on private.audit_log (
    table_name,
    row_id
  );

create index audit_log_actor_idx
  on private.audit_log (actor_user_id);

create index audit_log_created_at_idx
  on private.audit_log (created_at desc);

revoke all
  on table private.audit_log
  from public, anon, authenticated;


-- ============================================================
-- 12. COMMON HELPER FUNCTIONS
-- ============================================================

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
  limit 1;
$$;


create or replace function private.can_access_customer(
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and (
        (
          select private.current_app_role()
        ) in (
          'admin'::public.app_role,
          'supervisor'::public.app_role
        )
        or c.collector_id = (
          select auth.uid()
        )
      )
  );
$$;


create or replace function private.can_access_loan(
  p_loan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loans l
    join public.customers c
      on c.id = l.customer_id
    where l.id = p_loan_id
      and (
        (
          select private.current_app_role()
        ) in (
          'admin'::public.app_role,
          'supervisor'::public.app_role
        )
        or c.collector_id = (
          select auth.uid()
        )
      )
  );
$$;


create or replace function private.can_access_payment(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payments p
    join public.loans l
      on l.id = p.loan_id
    join public.customers c
      on c.id = l.customer_id
    where p.id = p_payment_id
      and (
        (
          select private.current_app_role()
        ) in (
          'admin'::public.app_role,
          'supervisor'::public.app_role
        )
        or c.collector_id = (
          select auth.uid()
        )
      )
  );
$$;


-- ============================================================
-- 13. VALIDATE COLLECTOR REFERENCES
-- ============================================================

create or replace function private.validate_collector_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.collector_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception
      'collector_id must reference an active collector';
  end if;

  return new;
end;
$$;


-- ============================================================
-- 14. PROTECT CUSTOMER ASSIGNMENT
-- ============================================================
-- Solo admin puede cambiar al cobrador de una cartera.
-- ============================================================

create or replace function private.protect_customer_collector()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.collector_id is distinct from new.collector_id
     and (select auth.uid()) is not null
     and (
       select private.current_app_role()
     ) is distinct from 'admin'::public.app_role
  then
    raise exception
      'only administrators can reassign customers';
  end if;

  return new;
end;
$$;


-- ============================================================
-- 15. PAYMENT / CUSTOMER COLLECTOR CONSISTENCY
-- ============================================================

create or replace function private.validate_payment_collector()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_collector uuid;
begin
  select c.collector_id
    into expected_collector
  from public.loans l
  join public.customers c
    on c.id = l.customer_id
  where l.id = new.loan_id;

  if expected_collector is null then
    raise exception 'loan/customer not found';
  end if;

  if new.collector_id <> expected_collector then
    raise exception
      'payment collector does not match customer collector';
  end if;

  return new;
end;
$$;


-- ============================================================
-- 16. PAYMENT ALLOCATION VALIDATION
-- ============================================================

create or replace function private.validate_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_loan uuid;
  payment_amount numeric(12,2);
  payment_status public.payment_status;

  installment_loan uuid;
  installment_amount numeric(12,2);

  allocated_to_payment numeric(12,2);
  allocated_to_installment numeric(12,2);
begin
  select
    p.loan_id,
    p.amount,
    p.status
  into
    payment_loan,
    payment_amount,
    payment_status
  from public.payments p
  where p.id = new.payment_id;

  if payment_status <> 'posted' then
    raise exception
      'allocations can only be added to posted payments';
  end if;

  select
    i.loan_id,
    i.scheduled_amount
  into
    installment_loan,
    installment_amount
  from public.installments i
  where i.id = new.installment_id;

  if payment_loan <> installment_loan then
    raise exception
      'payment and installment belong to different loans';
  end if;

  select coalesce(sum(pa.amount), 0)
    into allocated_to_payment
  from public.payment_allocations pa
  where pa.payment_id = new.payment_id
    and pa.id <> new.id;

  if allocated_to_payment + new.amount > payment_amount then
    raise exception
      'payment allocation exceeds payment amount';
  end if;

  select coalesce(sum(pa.amount), 0)
    into allocated_to_installment
  from public.payment_allocations pa
  join public.payments p
    on p.id = pa.payment_id
  where pa.installment_id = new.installment_id
    and pa.id <> new.id
    and p.status = 'posted';

  if allocated_to_installment + new.amount
     > installment_amount
  then
    raise exception
      'installment allocation exceeds scheduled amount';
  end if;

  return new;
end;
$$;


-- ============================================================
-- 17. AUDIT FUNCTION
-- ============================================================

create or replace function private.audit_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_reason text;
begin
  if to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  audit_reason :=
    nullif(
      current_setting(
        'app.audit_reason',
        true
      ),
      ''
    );

  insert into private.audit_log (
    table_name,
    row_id,
    actor_user_id,
    action,
    reason,
    old_data,
    new_data
  )
  values (
    tg_table_name,
    new.id,
    (select auth.uid()),
    'UPDATE',
    audit_reason,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;


-- ============================================================
-- 18. PREVENT PHYSICAL DELETE
-- ============================================================

create or replace function private.prevent_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'physical deletion is not allowed for %',
    tg_table_name;
end;
$$;


-- ============================================================
-- 19. UPDATED_AT TRIGGERS
-- ============================================================

create trigger profiles_touch_updated_at
before update on public.profiles
for each row
execute function private.touch_updated_at();

create trigger customers_touch_updated_at
before update on public.customers
for each row
execute function private.touch_updated_at();

create trigger loans_touch_updated_at
before update on public.loans
for each row
execute function private.touch_updated_at();

create trigger payments_touch_updated_at
before update on public.payments
for each row
execute function private.touch_updated_at();

create trigger cash_movements_touch_updated_at
before update on public.cash_movements
for each row
execute function private.touch_updated_at();

create trigger cash_closures_touch_updated_at
before update on public.cash_closures
for each row
execute function private.touch_updated_at();


-- ============================================================
-- 20. COLLECTOR VALIDATION TRIGGERS
-- ============================================================

create trigger customers_validate_collector
before insert or update of collector_id
on public.customers
for each row
execute function private.validate_collector_reference();

create trigger payments_validate_collector
before insert or update of collector_id
on public.payments
for each row
execute function private.validate_collector_reference();

create trigger cash_movements_validate_collector
before insert or update of collector_id
on public.cash_movements
for each row
execute function private.validate_collector_reference();

create trigger cash_closures_validate_collector
before insert or update of collector_id
on public.cash_closures
for each row
execute function private.validate_collector_reference();


create trigger customers_protect_collector
before update of collector_id
on public.customers
for each row
execute function private.protect_customer_collector();


create trigger payments_collector_consistency
before insert or update of loan_id, collector_id
on public.payments
for each row
execute function private.validate_payment_collector();


-- ============================================================
-- 21. PAYMENT ALLOCATION TRIGGER
-- ============================================================

create trigger payment_allocations_validate
before insert or update
on public.payment_allocations
for each row
execute function private.validate_payment_allocation();


-- ============================================================
-- 22. AUDIT TRIGGERS
-- ============================================================
-- Auditamos cambios, no cada INSERT, para evitar duplicar
-- innecesariamente el volumen de datos.
-- ============================================================

create trigger customers_audit_update
after update on public.customers
for each row
execute function private.audit_update();

create trigger loans_audit_update
after update on public.loans
for each row
execute function private.audit_update();

create trigger installments_audit_update
after update on public.installments
for each row
execute function private.audit_update();

create trigger payments_audit_update
after update on public.payments
for each row
execute function private.audit_update();

create trigger cash_movements_audit_update
after update on public.cash_movements
for each row
execute function private.audit_update();

create trigger cash_closures_audit_update
after update on public.cash_closures
for each row
execute function private.audit_update();


-- ============================================================
-- 23. DELETE PROTECTION
-- ============================================================

create trigger customers_prevent_delete
before delete on public.customers
for each row
execute function private.prevent_delete();

create trigger loans_prevent_delete
before delete on public.loans
for each row
execute function private.prevent_delete();

create trigger installments_prevent_delete
before delete on public.installments
for each row
execute function private.prevent_delete();

create trigger payments_prevent_delete
before delete on public.payments
for each row
execute function private.prevent_delete();

create trigger payment_allocations_prevent_delete
before delete on public.payment_allocations
for each row
execute function private.prevent_delete();

create trigger cash_movements_prevent_delete
before delete on public.cash_movements
for each row
execute function private.prevent_delete();

create trigger cash_closures_prevent_delete
before delete on public.cash_closures
for each row
execute function private.prevent_delete();


-- ============================================================
-- 24. INSTALLMENT BALANCE VIEW
-- ============================================================
-- No persistimos paid_amount ni estado.
-- Los derivamos de payments + allocations.
-- ============================================================

create view public.installment_balances
with (security_invoker = true)
as
with allocation_totals as (
  select
    pa.installment_id,

    coalesce(
      sum(pa.amount)
      filter (
        where p.status = 'posted'
      ),
      0
    )::numeric(12,2) as paid_amount

  from public.payment_allocations pa

  join public.payments p
    on p.id = pa.payment_id

  group by pa.installment_id
),
balances as (
  select
    i.id,
    i.loan_id,
    i.installment_number,
    i.due_date,
    i.scheduled_amount,

    coalesce(
      a.paid_amount,
      0
    )::numeric(12,2) as paid_amount,

    greatest(
      i.scheduled_amount
        - coalesce(a.paid_amount, 0),
      0
    )::numeric(12,2)
      as outstanding_amount

  from public.installments i

  left join allocation_totals a
    on a.installment_id = i.id
)
select
  b.*,

  case
    when b.outstanding_amount = 0
      then 'paid'

    when b.due_date
      < ((now() at time zone 'America/Lima')::date)
      then 'overdue'

    else 'pending'
  end as status,

  case
    when b.outstanding_amount > 0
      and b.due_date
        < ((now() at time zone 'America/Lima')::date)

    then (
      (now() at time zone 'America/Lima')::date
      - b.due_date
    )

    else 0
  end as overdue_days

from balances b;


-- ============================================================
-- 25. CUSTOMER FINANCIAL STATUS VIEW
-- ============================================================
-- "Lista negra" se deriva, no se guarda.
--
-- > 5 días de atraso => blacklist
-- al ponerse al día => sale automáticamente.
-- ============================================================

create view public.customer_financial_status
with (security_invoker = true)
as
select
  c.id as customer_id,

  coalesce(
    max(ib.overdue_days),
    0
  ) as max_overdue_days,

  (
    coalesce(
      max(ib.overdue_days),
      0
    ) > 5
  ) as is_blacklisted,

  coalesce(
    sum(ib.outstanding_amount),
    0
  )::numeric(12,2)
    as outstanding_amount

from public.customers c

left join public.loans l
  on l.customer_id = c.id
  and l.status = 'active'

left join public.installment_balances ib
  on ib.loan_id = l.id

group by c.id;


-- ============================================================
-- 26. ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles
  enable row level security;

alter table public.customers
  enable row level security;

alter table public.loans
  enable row level security;

alter table public.installments
  enable row level security;

alter table public.payments
  enable row level security;

alter table public.payment_allocations
  enable row level security;

alter table public.cash_movements
  enable row level security;

alter table public.cash_closures
  enable row level security;


-- ============================================================
-- 27. PROFILES POLICIES
-- ============================================================

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
);


-- ============================================================
-- 28. CUSTOMERS POLICIES
-- ============================================================

create policy customers_select
on public.customers
for select
to authenticated
using (
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or collector_id = (
    select auth.uid()
  )
);


create policy customers_insert
on public.customers
for insert
to authenticated
with check (
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or collector_id = (
    select auth.uid()
  )
);


create policy customers_update
on public.customers
for update
to authenticated
using (
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
)
with check (
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
);


-- ============================================================
-- 29. LOANS POLICIES
-- ============================================================

create policy loans_select
on public.loans
for select
to authenticated
using (
  private.can_access_customer(customer_id)
);


-- ============================================================
-- 30. INSTALLMENTS POLICIES
-- ============================================================

create policy installments_select
on public.installments
for select
to authenticated
using (
  private.can_access_loan(loan_id)
);


-- ============================================================
-- 31. PAYMENTS POLICIES
-- ============================================================

create policy payments_select
on public.payments
for select
to authenticated
using (
  private.can_access_loan(loan_id)
);


-- ============================================================
-- 32. PAYMENT ALLOCATIONS POLICIES
-- ============================================================

create policy payment_allocations_select
on public.payment_allocations
for select
to authenticated
using (
  private.can_access_payment(payment_id)
);


-- ============================================================
-- 33. CASH MOVEMENTS POLICIES
-- ============================================================

create policy cash_movements_select
on public.cash_movements
for select
to authenticated
using (
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or collector_id = (
    select auth.uid()
  )
);


-- ============================================================
-- 34. CASH CLOSURES POLICIES
-- ============================================================

create policy cash_closures_select
on public.cash_closures
for select
to authenticated
using (
  (
    select private.current_app_role()
  ) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or collector_id = (
    select auth.uid()
  )
);


-- ============================================================
-- 35. MINIMUM TABLE PRIVILEGES
-- ============================================================

revoke all
on table
  public.profiles,
  public.customers,
  public.loans,
  public.installments,
  public.payments,
  public.payment_allocations,
  public.cash_movements,
  public.cash_closures
from anon, authenticated;


grant select
on table
  public.profiles,
  public.customers,
  public.loans,
  public.installments,
  public.payments,
  public.payment_allocations,
  public.cash_movements,
  public.cash_closures
to authenticated;


-- Customer creation/update is simple enough to expose
-- directly under RLS.
grant insert, update
on table public.customers
to authenticated;


revoke all
on table
  public.installment_balances,
  public.customer_financial_status
from anon, authenticated;

grant select
on table
  public.installment_balances,
  public.customer_financial_status
to authenticated;


-- ============================================================
-- 36. FUNCTION PRIVILEGES
-- ============================================================

revoke execute
on function private.current_app_role()
from public, anon;

revoke execute
on function private.can_access_customer(uuid)
from public, anon;

revoke execute
on function private.can_access_loan(uuid)
from public, anon;

revoke execute
on function private.can_access_payment(uuid)
from public, anon;


grant execute
on function private.current_app_role()
to authenticated;

grant execute
on function private.can_access_customer(uuid)
to authenticated;

grant execute
on function private.can_access_loan(uuid)
to authenticated;

grant execute
on function private.can_access_payment(uuid)
to authenticated;


-- Trigger/internal functions must not be callable directly
-- from application roles.

revoke execute
on function private.touch_updated_at()
from public, anon, authenticated;

revoke execute
on function private.validate_collector_reference()
from public, anon, authenticated;

revoke execute
on function private.protect_customer_collector()
from public, anon, authenticated;

revoke execute
on function private.validate_payment_collector()
from public, anon, authenticated;

revoke execute
on function private.validate_payment_allocation()
from public, anon, authenticated;

revoke execute
on function private.audit_update()
from public, anon, authenticated;

revoke execute
on function private.prevent_delete()
from public, anon, authenticated;
