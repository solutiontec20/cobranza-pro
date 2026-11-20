-- ============================================================
-- COBRANZAPRO - ACTIVE SCHEDULE PAYMENT ALLOCATION
-- ============================================================

alter table public.payment_allocations
  add column superseded_at timestamptz,
  add column supersession_reason text;

alter table public.payment_allocations
  add constraint payment_allocations_supersession_consistency_chk
  check (
    (
      superseded_at is null
      and supersession_reason is null
    )
    or
    (
      superseded_at is not null
      and nullif(btrim(supersession_reason), '') is not null
    )
  );

alter table public.payment_allocations
  drop constraint payment_allocations_unique;

create unique index payment_allocations_active_unique_idx
  on public.payment_allocations (payment_id, installment_id)
  where superseded_at is null;
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
  if new.superseded_at is not null then
    return new;
  end if;

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
  where i.id = new.installment_id
    and i.superseded_at is null;

  if installment_loan is null then
    raise exception
      'allocations can only target active installments';
  end if;

  if payment_loan <> installment_loan then
    raise exception
      'payment and installment belong to different loans';
  end if;

  select coalesce(sum(pa.amount), 0)
    into allocated_to_payment
  from public.payment_allocations pa
  where pa.payment_id = new.payment_id
    and pa.id <> new.id
    and pa.superseded_at is null;

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
    and p.status = 'posted'
    and pa.superseded_at is null;

  if allocated_to_installment + new.amount
     > installment_amount
  then
    raise exception
      'installment allocation exceeds scheduled amount';
  end if;

  return new;
end;
$$;

create trigger payment_allocations_audit_update
after update on public.payment_allocations
for each row
execute function private.audit_update();

-- Rebuild allocations created against preserved historical schedules.
-- Payment rows and the original allocation rows remain immutable evidence;
-- only the erroneous allocation rows are superseded.
do $$
declare
  v_loan_id uuid;
  v_payment record;
  v_installment record;
  v_remaining numeric(12,2);
  v_outstanding numeric(12,2);
  v_allocation numeric(12,2);
  v_superseded_at timestamptz;
begin
  for v_loan_id in
    select distinct p.loan_id
    from public.payment_allocations pa
    join public.payments p
      on p.id = pa.payment_id
    join public.installments i
      on i.id = pa.installment_id
    where pa.superseded_at is null
      and i.superseded_at is not null
  loop
    perform 1
    from public.loans l
    where l.id = v_loan_id
    for update;

    perform i.id
    from public.installments i
    where i.loan_id = v_loan_id
      and i.superseded_at is null
    for update;

    perform set_config(
      'app.audit_reason',
      'Correct payment allocation from superseded loan schedule',
      true
    );

    v_superseded_at := clock_timestamp();

    update public.payment_allocations pa
    set
      superseded_at = v_superseded_at,
      supersession_reason =
        'Corrected allocation from superseded loan schedule'
    from public.payments p
    where p.id = pa.payment_id
      and p.loan_id = v_loan_id
      and pa.superseded_at is null;

    for v_payment in
      select
        p.id,
        p.amount
      from public.payments p
      where p.loan_id = v_loan_id
        and p.status = 'posted'::public.payment_status
      order by
        p.paid_at,
        p.created_at,
        p.id
    loop
      v_remaining := v_payment.amount;

      for v_installment in
        select
          i.id,
          i.scheduled_amount
        from public.installments i
        where i.loan_id = v_loan_id
          and i.superseded_at is null
        order by i.installment_number
      loop
        select greatest(
          v_installment.scheduled_amount
            - coalesce(sum(pa.amount), 0),
          0
        )::numeric(12,2)
        into v_outstanding
        from public.payment_allocations pa
        join public.payments p
          on p.id = pa.payment_id
        where pa.installment_id = v_installment.id
          and pa.superseded_at is null
          and p.status = 'posted'::public.payment_status;

        continue when v_outstanding <= 0;
        exit when v_remaining <= 0;

        v_allocation := least(v_remaining, v_outstanding);

        insert into public.payment_allocations (
          payment_id,
          installment_id,
          amount
        )
        values (
          v_payment.id,
          v_installment.id,
          v_allocation
        );

        v_remaining := v_remaining - v_allocation;
      end loop;

      if v_remaining <> 0 then
        raise exception
          'Unable to repair payment allocations for loan %',
          v_loan_id
          using errcode = '22023';
      end if;
    end loop;
  end loop;
end;
$$;
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
          and i.superseded_at is null
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
          and i.superseded_at is null
          and p.status = 'posted'::public.payment_status
          and pa.superseded_at is null
      ),
      0
    ),
    0
  )::numeric(12,2);
$$;

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

create or replace view public.installment_balances
with (security_invoker = true)
as
with allocation_totals as (
  select
    pa.installment_id,
    coalesce(
      sum(pa.amount) filter (where p.status = 'posted'),
      0
    )::numeric(12,2) as paid_amount
  from public.payment_allocations pa
  join public.payments p
    on p.id = pa.payment_id
  where pa.superseded_at is null
  group by pa.installment_id
),
balances as (
  select
    i.id,
    i.loan_id,
    i.installment_number,
    i.due_date,
    i.scheduled_amount,
    coalesce(a.paid_amount, 0)::numeric(12,2) as paid_amount,
    greatest(
      i.scheduled_amount - coalesce(a.paid_amount, 0),
      0
    )::numeric(12,2) as outstanding_amount
  from public.installments i
  left join allocation_totals a
    on a.installment_id = i.id
  where i.superseded_at is null
)
select
  b.*,
  case
    when b.outstanding_amount = 0 then 'paid'
    when b.due_date < ((now() at time zone 'America/Lima')::date)
      then 'overdue'
    when b.paid_amount > 0 then 'partial'
    else 'pending'
  end as status,
  case
    when b.outstanding_amount > 0
      and b.due_date < ((now() at time zone 'America/Lima')::date)
    then ((now() at time zone 'America/Lima')::date - b.due_date)
    else 0
  end as overdue_days
from balances b;

