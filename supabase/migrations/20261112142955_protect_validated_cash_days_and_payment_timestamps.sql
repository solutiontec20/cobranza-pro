-- FIN-001: a validated cash day is immutable. The guard lives on the ledger
-- table so every present and future RPC is protected, not only today's UI.
-- FIN-002: collectors cannot choose the accounting timestamp of a payment.

create or replace function private.assert_cash_day_open(
  p_collector_id uuid,
  p_business_date date
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.cash_closure_status;
begin
  select cc.status
    into v_status
  from public.cash_closures cc
  where cc.collector_id = p_collector_id
    and cc.business_date = p_business_date
  for update;

  if found and v_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot register cash movements once the cash closure has been validated'
      using errcode = '22023';
  end if;
end;
$$;

revoke all
on function private.assert_cash_day_open(uuid, date)
from public, anon, authenticated;

create or replace function private.enforce_cash_movement_open_day()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pair record;
begin
  if tg_op = 'INSERT' then
    perform private.assert_cash_day_open(new.collector_id, new.business_date);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.assert_cash_day_open(old.collector_id, old.business_date);
    return old;
  end if;

  -- Lock both days in a deterministic order. This protects the source and
  -- destination of an update without introducing a lock-order deadlock.
  for v_pair in
    select distinct pair.collector_id, pair.business_date
    from (
      values
        (old.collector_id, old.business_date),
        (new.collector_id, new.business_date)
    ) as pair(collector_id, business_date)
    order by pair.collector_id, pair.business_date
  loop
    perform private.assert_cash_day_open(v_pair.collector_id, v_pair.business_date);
  end loop;

  return new;
end;
$$;

revoke all
on function private.enforce_cash_movement_open_day()
from public, anon, authenticated;

drop trigger if exists cash_movements_block_validated_days
on public.cash_movements;

create trigger cash_movements_block_validated_days
before insert or update or delete
on public.cash_movements
for each row
execute function private.enforce_cash_movement_open_day();
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
  v_effective_paid_at timestamptz;

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


  -- Collectors may only post at the authoritative server timestamp. Admins and
  -- supervisors retain the existing audited backdating capability.
  v_effective_paid_at := case
    when v_role = 'collector'::public.app_role then now()
    else p_paid_at
  end;


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


  if v_effective_paid_at is null then
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
    v_effective_paid_at,
    (
      v_effective_paid_at
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
      and pa.superseded_at is null

    left join public.payments p
      on p.id = pa.payment_id

    where i.loan_id = p_loan_id
      and i.superseded_at is null

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
    v_effective_paid_at,
    (
      v_effective_paid_at
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
      closed_at = v_effective_paid_at,
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
