-- ============================================================
-- COBRANZAPRO - FINANCIAL RPCs
-- ============================================================
--
-- Operaciones financieras transaccionales.
--
-- IMPORTANTE:
-- Estas funciones usan SECURITY DEFINER porque las tablas
-- financieras no permiten INSERT/UPDATE directo a authenticated.
--
-- Por ello:
-- - search_path siempre vacío.
-- - nombres de tablas siempre con schema.
-- - autorización validada explícitamente.
-- - EXECUTE revocado por defecto.
-- ============================================================


-- ============================================================
-- 1. CASH MOVEMENT REVERSALS
-- ============================================================
-- Permite registrar contramovimientos al anular un pago,
-- preservando el ledger original.
-- ============================================================

alter table public.cash_movements
add column reversal_of_id uuid
references public.cash_movements(id)
on delete restrict;

alter table public.cash_movements
add constraint cash_movements_reversal_not_self_chk
check (
  reversal_of_id is null
  or reversal_of_id <> id
);

create unique index cash_movements_reversal_of_unique_idx
on public.cash_movements (reversal_of_id)
where reversal_of_id is not null;


-- ============================================================
-- 2. LOAN OUTSTANDING HELPER
-- ============================================================

create or replace function private.loan_outstanding(
  p_loan_id uuid
)
returns numeric(12,2)
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce(
      (
        select sum(i.scheduled_amount)
        from public.installments i
        where i.loan_id = p_loan_id
      ),
      0
    )
    -
    coalesce(
      (
        select sum(pa.amount)
        from public.payment_allocations pa

        join public.payments p
          on p.id = pa.payment_id

        join public.installments i
          on i.id = pa.installment_id

        where i.loan_id = p_loan_id
          and p.status = 'posted'::public.payment_status
      ),
      0
    ),
    0
  )::numeric(12,2);
$$;


revoke execute
on function private.loan_outstanding(uuid)
from public, anon, authenticated;


-- ============================================================
-- 3. REGISTER PAYMENT
-- ============================================================
--
-- Garantiza atómicamente:
--
-- payment
--   +
-- allocations
--   +
-- cash movement
--   +
-- loan status
--
-- El pago se distribuye automáticamente desde la cuota
-- pendiente más antigua hacia las futuras.
-- ============================================================

create or replace function public.register_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns table (
  payment_id uuid,
  allocated_amount numeric(12,2),
  remaining_balance numeric(12,2),
  resulting_loan_status public.loan_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;

  v_customer_id uuid;
  v_collector_id uuid;
  v_loan_status public.loan_status;

  v_outstanding numeric(12,2);
  v_remaining numeric(12,2);
  v_allocation numeric(12,2);

  v_payment_id uuid;
  v_after_balance numeric(12,2);

  v_result_status public.loan_status;

  r record;
begin

  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------

  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select private.current_app_role()
    into v_role;


  if v_role is null then
    raise exception 'Active application profile required'
      using errcode = '42501';
  end if;


  -- ----------------------------------------------------------
  -- Input validation
  -- ----------------------------------------------------------

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero'
      using errcode = '22023';
  end if;


  if p_amount <> round(p_amount, 2) then
    raise exception 'Payment amount may contain at most two decimals'
      using errcode = '22023';
  end if;


  if p_payment_method is null
     or btrim(p_payment_method) = ''
  then
    raise exception 'Payment method is required'
      using errcode = '22023';
  end if;


  if p_paid_at is null then
    raise exception 'Payment date is required'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Lock loan
  --
  -- Serializes concurrent payments on the same loan.
  -- ----------------------------------------------------------

  select
    l.customer_id,
    l.status
  into
    v_customer_id,
    v_loan_status
  from public.loans l
  where l.id = p_loan_id
  for update;


  if not found then
    raise exception 'Loan not found'
      using errcode = '22023';
  end if;


  if v_loan_status <> 'active'::public.loan_status then
    raise exception 'Payments can only be registered on active loans'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Lock customer assignment
  -- ----------------------------------------------------------

  select c.collector_id
    into v_collector_id
  from public.customers c
  where c.id = v_customer_id
  for share;


  if not found then
    raise exception 'Customer not found'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Authorization
  -- ----------------------------------------------------------

  if v_role = 'collector'::public.app_role then

    if v_collector_id <> v_actor then
      raise exception 'Collector cannot register payments for another portfolio'
        using errcode = '42501';
    end if;

  elsif v_role not in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  ) then

    raise exception 'Insufficient privileges'
      using errcode = '42501';

  end if;


  -- ----------------------------------------------------------
  -- Current outstanding
  -- ----------------------------------------------------------

  select private.loan_outstanding(p_loan_id)
    into v_outstanding;


  if v_outstanding <= 0 then
    raise exception 'Loan has no outstanding balance'
      using errcode = '22023';
  end if;


  if p_amount > v_outstanding then
    raise exception
      'Payment exceeds outstanding loan balance'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Insert payment
  -- ----------------------------------------------------------

  insert into public.payments (
    loan_id,
    collector_id,
    amount,
    payment_method,
    paid_at,
    business_date,
    status,
    created_by,
    notes
  )
  values (
    p_loan_id,
    v_collector_id,
    p_amount::numeric(12,2),
    btrim(p_payment_method),
    p_paid_at,
    (
      p_paid_at
      at time zone 'America/Lima'
    )::date,
    'posted'::public.payment_status,
    v_actor,
    nullif(btrim(p_notes), '')
  )
  returning id
  into v_payment_id;


  -- ----------------------------------------------------------
  -- Allocate oldest outstanding installments first.
  --
  -- This supports:
  -- - partial payments
  -- - exact installments
  -- - advance payments across multiple installments
  -- ----------------------------------------------------------

  v_remaining := p_amount::numeric(12,2);


  for r in

    select
      i.id as installment_id,

      (
        i.scheduled_amount
        -
        coalesce(
          sum(pa.amount)
            filter (
              where p.status =
                'posted'::public.payment_status
            ),
          0
        )
      )::numeric(12,2)
        as outstanding_amount

    from public.installments i

    left join public.payment_allocations pa
      on pa.installment_id = i.id

    left join public.payments p
      on p.id = pa.payment_id

    where i.loan_id = p_loan_id

    group by
      i.id,
      i.installment_number,
      i.scheduled_amount

    having
      i.scheduled_amount
      -
      coalesce(
        sum(pa.amount)
          filter (
            where p.status =
              'posted'::public.payment_status
          ),
        0
      )
      > 0

    order by i.installment_number

  loop

    exit when v_remaining <= 0;


    v_allocation :=
      least(
        v_remaining,
        r.outstanding_amount
      );


    insert into public.payment_allocations (
      payment_id,
      installment_id,
      amount
    )
    values (
      v_payment_id,
      r.installment_id,
      v_allocation
    );


    v_remaining :=
      v_remaining - v_allocation;

  end loop;


  if v_remaining <> 0 then
    raise exception 'Unable to fully allocate payment'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Register cash ledger movement
  -- ----------------------------------------------------------

  insert into public.cash_movements (
    collector_id,
    customer_id,
    loan_id,
    payment_id,
    direction,
    movement_type,
    amount,
    payment_method,
    occurred_at,
    business_date,
    created_by
  )
  values (
    v_collector_id,
    v_customer_id,
    p_loan_id,
    v_payment_id,
    'inflow'::public.cash_direction,
    'collection',
    p_amount::numeric(12,2),
    btrim(p_payment_method),
    p_paid_at,
    (
      p_paid_at
      at time zone 'America/Lima'
    )::date,
    v_actor
  );


  -- ----------------------------------------------------------
  -- Determine resulting loan balance
  -- ----------------------------------------------------------

  v_after_balance :=
    (
      v_outstanding - p_amount
    )::numeric(12,2);


  if v_after_balance = 0 then

    perform set_config(
      'app.audit_reason',
      'Loan settled by payment ' || v_payment_id::text,
      true
    );


    update public.loans
    set
      status = 'paid'::public.loan_status,
      closed_at = p_paid_at,
      close_reason = 'paid'
    where id = p_loan_id;


    v_result_status :=
      'paid'::public.loan_status;

  else

    v_result_status :=
      'active'::public.loan_status;

  end if;


  return query
  select
    v_payment_id,
    p_amount::numeric(12,2),
    v_after_balance,
    v_result_status;

end;
$$;


-- ============================================================
-- 4. VOID PAYMENT
-- ============================================================
--
-- Nunca elimina el pago.
--
-- Marca payment como voided y crea un contramovimiento
-- en el ledger de caja.
-- ============================================================

create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
)
returns table (
  payment_id uuid,
  loan_id uuid,
  remaining_balance numeric(12,2)
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;

  v_loan_id uuid;
  v_customer_id uuid;
  v_collector_id uuid;

  v_amount numeric(12,2);
  v_payment_method text;

  v_payment_status public.payment_status;
  v_loan_status public.loan_status;

  v_original_movement_id uuid;

  v_remaining_balance numeric(12,2);
begin

  v_actor := auth.uid();


  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select private.current_app_role()
    into v_role;


  -- Only privileged users may void payments.
  if v_role not in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  ) then

    raise exception 'Only administrators or supervisors may void payments'
      using errcode = '42501';

  end if;


  if p_reason is null
     or btrim(p_reason) = ''
  then
    raise exception 'Void reason is required'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Lock payment
  -- ----------------------------------------------------------

  select
    p.loan_id,
    p.collector_id,
    p.amount,
    p.payment_method,
    p.status
  into
    v_loan_id,
    v_collector_id,
    v_amount,
    v_payment_method,
    v_payment_status
  from public.payments p
  where p.id = p_payment_id
  for update;


  if not found then
    raise exception 'Payment not found'
      using errcode = '22023';
  end if;


  if v_payment_status = 'voided'::public.payment_status then
    raise exception 'Payment is already voided'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Lock related loan
  -- ----------------------------------------------------------

  select
    l.customer_id,
    l.status
  into
    v_customer_id,
    v_loan_status
  from public.loans l
  where l.id = v_loan_id
  for update;


  if not found then
    raise exception 'Loan not found'
      using errcode = '22023';
  end if;


  -- Do not modify historical loans already renewed.
  if v_loan_status in (
    'renewed'::public.loan_status,
    'voided'::public.loan_status
  ) then

    raise exception
      'Payments on renewed or voided loans cannot be voided directly'
      using errcode = '22023';

  end if;


  -- ----------------------------------------------------------
  -- Locate original cash movement
  -- ----------------------------------------------------------

  select cm.id
    into v_original_movement_id
  from public.cash_movements cm
  where cm.payment_id = p_payment_id
    and cm.direction =
      'inflow'::public.cash_direction
    and cm.movement_type = 'collection'
  limit 1;


  if v_original_movement_id is null then
    raise exception 'Original cash movement not found'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Audit reason consumed by audit trigger
  -- ----------------------------------------------------------

  perform set_config(
    'app.audit_reason',
    btrim(p_reason),
    true
  );


  -- ----------------------------------------------------------
  -- Void payment
  -- ----------------------------------------------------------

  update public.payments
  set
    status = 'voided'::public.payment_status,
    voided_at = now(),
    voided_by = v_actor,
    void_reason = btrim(p_reason)
  where id = p_payment_id;


  -- ----------------------------------------------------------
  -- Create reversing cash movement.
  --
  -- The original ledger entry stays untouched.
  -- ----------------------------------------------------------

  insert into public.cash_movements (
    collector_id,
    customer_id,
    loan_id,
    payment_id,
    reversal_of_id,
    direction,
    movement_type,
    amount,
    payment_method,
    occurred_at,
    business_date,
    notes,
    created_by
  )
  values (
    v_collector_id,
    v_customer_id,
    v_loan_id,
    null,
    v_original_movement_id,
    'outflow'::public.cash_direction,
    'payment_void',
    v_amount,
    v_payment_method,
    now(),
    (
      now()
      at time zone 'America/Lima'
    )::date,
    btrim(p_reason),
    v_actor
  );


  -- ----------------------------------------------------------
  -- Payment allocations stay in place.
  --
  -- Because calculations only consider payments with
  -- status = posted, they automatically stop counting.
  -- ----------------------------------------------------------

  select private.loan_outstanding(v_loan_id)
    into v_remaining_balance;


  -- If the payment had closed the loan, reopen it.
  if v_loan_status = 'paid'::public.loan_status
     and v_remaining_balance > 0
  then

    -- Avoid violating one-active-loan-per-customer.
    if exists (
      select 1
      from public.loans l
      where l.customer_id = v_customer_id
        and l.id <> v_loan_id
        and l.status =
          'active'::public.loan_status
    ) then

      raise exception
        'Payment cannot be voided because customer already has another active loan'
        using errcode = '22023';

    end if;


    perform set_config(
      'app.audit_reason',
      'Loan reopened because payment '
      || p_payment_id::text
      || ' was voided: '
      || btrim(p_reason),
      true
    );


    update public.loans
    set
      status = 'active'::public.loan_status,
      closed_at = null,
      close_reason = null
    where id = v_loan_id;

  end if;


  return query
  select
    p_payment_id,
    v_loan_id,
    v_remaining_balance;

end;
$$;


-- ============================================================
-- 5. SUBMIT CASH CLOSURE
-- ============================================================

create or replace function public.submit_cash_closure(
  p_business_date date,
  p_delivered_amount numeric,
  p_observation text default null
)
returns table (
  closure_id uuid,
  expected_amount numeric(12,2),
  delivered_amount numeric(12,2),
  difference_amount numeric(12,2),
  closure_status public.cash_closure_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;

  v_closure_id uuid;
  v_existing_status public.cash_closure_status;
  v_exists boolean;

  v_expected numeric(12,2);
begin

  v_actor := auth.uid();


  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select private.current_app_role()
    into v_role;


  if v_role <> 'collector'::public.app_role then
    raise exception 'Only collectors may submit their cash closure'
      using errcode = '42501';
  end if;


  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;


  if p_business_date >
     (
       now()
       at time zone 'America/Lima'
     )::date
  then
    raise exception 'Future cash closures are not allowed'
      using errcode = '22023';
  end if;


  if p_delivered_amount is null
     or p_delivered_amount < 0
  then
    raise exception 'Delivered amount cannot be negative'
      using errcode = '22023';
  end if;


  if p_delivered_amount <> round(p_delivered_amount, 2) then
    raise exception 'Delivered amount may contain at most two decimals'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Lock existing closure if present
  -- ----------------------------------------------------------

  select
    cc.id,
    cc.status
  into
    v_closure_id,
    v_existing_status
  from public.cash_closures cc
  where cc.collector_id = v_actor
    and cc.business_date = p_business_date
  for update;


  v_exists := found;


  if v_exists
     and v_existing_status =
       'validated'::public.cash_closure_status
  then
    raise exception 'Validated cash closure cannot be resubmitted'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Calculate expected net cash
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(
        case cm.direction
          when 'inflow'::public.cash_direction
            then cm.amount
          when 'outflow'::public.cash_direction
            then -cm.amount
        end
      ),
      0
    )::numeric(12,2)

  into v_expected

  from public.cash_movements cm

  where cm.collector_id = v_actor
    and cm.business_date = p_business_date;


  -- ----------------------------------------------------------
  -- Insert or update closure
  -- ----------------------------------------------------------

  if v_exists then

    perform set_config(
      'app.audit_reason',
      'Cash closure resubmitted',
      true
    );


    update public.cash_closures
    set
      expected_amount = v_expected,
      delivered_amount =
        p_delivered_amount::numeric(12,2),
      status =
        'submitted'::public.cash_closure_status,
      observation =
        nullif(btrim(p_observation), ''),
      submitted_at = now()
    where id = v_closure_id;

  else

    insert into public.cash_closures (
      collector_id,
      business_date,
      expected_amount,
      delivered_amount,
      status,
      observation,
      submitted_at,
      created_by
    )
    values (
      v_actor,
      p_business_date,
      v_expected,
      p_delivered_amount::numeric(12,2),
      'submitted'::public.cash_closure_status,
      nullif(btrim(p_observation), ''),
      now(),
      v_actor
    )
    returning id
      into v_closure_id;

  end if;


  return query

  select
    cc.id,
    cc.expected_amount,
    cc.delivered_amount,
    cc.difference_amount,
    cc.status

  from public.cash_closures cc
  where cc.id = v_closure_id;

end;
$$;


-- ============================================================
-- 6. VALIDATE CASH CLOSURE
-- ============================================================

create or replace function public.validate_cash_closure(
  p_closure_id uuid,
  p_observation text default null
)
returns table (
  closure_id uuid,
  expected_amount numeric(12,2),
  delivered_amount numeric(12,2),
  difference_amount numeric(12,2),
  closure_status public.cash_closure_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;

  v_collector_id uuid;
  v_business_date date;
  v_status public.cash_closure_status;

  v_expected numeric(12,2);
begin

  v_actor := auth.uid();


  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select private.current_app_role()
    into v_role;


  if v_role not in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  ) then

    raise exception
      'Only administrators or supervisors may validate cash closures'
      using errcode = '42501';

  end if;


  -- ----------------------------------------------------------
  -- Lock closure
  -- ----------------------------------------------------------

  select
    cc.collector_id,
    cc.business_date,
    cc.status
  into
    v_collector_id,
    v_business_date,
    v_status
  from public.cash_closures cc
  where cc.id = p_closure_id
  for update;


  if not found then
    raise exception 'Cash closure not found'
      using errcode = '22023';
  end if;


  if v_status <> 'submitted'::public.cash_closure_status then
    raise exception 'Only submitted cash closures may be validated'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Recalculate expected amount at validation time.
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(
        case cm.direction
          when 'inflow'::public.cash_direction
            then cm.amount
          when 'outflow'::public.cash_direction
            then -cm.amount
        end
      ),
      0
    )::numeric(12,2)

  into v_expected

  from public.cash_movements cm

  where cm.collector_id = v_collector_id
    and cm.business_date = v_business_date;


  perform set_config(
    'app.audit_reason',
    'Cash closure validated',
    true
  );


  update public.cash_closures
  set
    expected_amount = v_expected,
    status =
      'validated'::public.cash_closure_status,
    validated_at = now(),
    validated_by = v_actor,

    observation =
      coalesce(
        nullif(btrim(p_observation), ''),
        observation
      )

  where id = p_closure_id;


  return query

  select
    cc.id,
    cc.expected_amount,
    cc.delivered_amount,
    cc.difference_amount,
    cc.status

  from public.cash_closures cc
  where cc.id = p_closure_id;

end;
$$;


-- ============================================================
-- 7. RPC PERMISSIONS
-- ============================================================
--
-- PostgreSQL grants EXECUTE to PUBLIC by default.
-- Explicitly remove it and expose only to authenticated.
-- ============================================================

revoke execute
on function public.register_payment(
  uuid,
  numeric,
  text,
  timestamptz,
  text
)
from public, anon;


revoke execute
on function public.void_payment(
  uuid,
  text
)
from public, anon;


revoke execute
on function public.submit_cash_closure(
  date,
  numeric,
  text
)
from public, anon;


revoke execute
on function public.validate_cash_closure(
  uuid,
  text
)
from public, anon;


grant execute
on function public.register_payment(
  uuid,
  numeric,
  text,
  timestamptz,
  text
)
to authenticated;


grant execute
on function public.void_payment(
  uuid,
  text
)
to authenticated;


grant execute
on function public.submit_cash_closure(
  date,
  numeric,
  text
)
to authenticated;


grant execute
on function public.validate_cash_closure(
  uuid,
  text
)
to authenticated;
