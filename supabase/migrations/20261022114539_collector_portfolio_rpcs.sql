-- Atomic collector onboarding and collector-scoped portfolio projection.

create or replace function public.collector_create_customer_loan(
  p_document_number text,
  p_full_name text,
  p_phone text,
  p_address text,
  p_notes text,
  p_principal numeric,
  p_interest_rate numeric,
  p_frequency public.loan_frequency,
  p_installment_count integer,
  p_started_on date
)
returns table (
  customer_id uuid,
  loan_id uuid,
  total_amount numeric(12,2),
  base_installment_amount numeric(12,2),
  last_installment_amount numeric(12,2),
  first_due_on date
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_customer_id uuid;
  v_loan_id uuid;
  v_total numeric(12,2);
  v_base_installment numeric(12,2);
  v_installment_amount numeric(12,2);
  v_first_due_on date;
  v_due_date date;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_actor
    and p.role = 'collector'::public.app_role
    and p.active = true
  for share;

  if not found then
    raise exception 'Only active collectors may create customers and loans'
      using errcode = '42501';
  end if;

  if p_document_number is null
    or btrim(p_document_number) !~ '^[0-9]{8,12}$'
  then
    raise exception 'Customer document must contain 8 to 12 digits'
      using errcode = '22023';
  end if;

  if p_full_name is null
    or nullif(btrim(p_full_name), '') is null
    or char_length(btrim(p_full_name)) > 160
  then
    raise exception 'Invalid customer name' using errcode = '22023';
  end if;

  if p_phone is not null
    and nullif(btrim(p_phone), '') is not null
    and btrim(p_phone) !~ '^[0-9]{1,15}$'
  then
    raise exception 'Customer phone must contain at most 15 digits'
      using errcode = '22023';
  end if;

  if p_address is null or nullif(btrim(p_address), '') is null then
    raise exception 'Customer address is required' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(btrim(p_notes)) > 500 then
    raise exception 'Customer notes may contain at most 500 characters'
      using errcode = '22023';
  end if;

  if p_principal is null or p_principal <= 0 then
    raise exception 'Principal must be greater than zero' using errcode = '22023';
  end if;

  if p_principal <> round(p_principal, 2) then
    raise exception 'Principal may contain at most two decimals'
      using errcode = '22023';
  end if;

  if p_interest_rate is null or p_interest_rate < 0 then
    raise exception 'Interest rate cannot be negative' using errcode = '22023';
  end if;

  if p_interest_rate <> round(p_interest_rate, 4) then
    raise exception 'Interest rate may contain at most four decimals'
      using errcode = '22023';
  end if;

  if p_frequency is null then
    raise exception 'Loan frequency is required' using errcode = '22023';
  end if;

  if p_installment_count is null
    or p_installment_count <= 0
    or p_installment_count > 32767
  then
    raise exception 'Invalid installment count' using errcode = '22023';
  end if;

  if p_started_on is null then
    raise exception 'Loan start date is required' using errcode = '22023';
  end if;

  v_first_due_on := p_started_on;

  if p_frequency = 'daily'::public.loan_frequency then
    while extract(isodow from v_first_due_on) = 7 loop
      v_first_due_on := v_first_due_on + 1;
    end loop;
  end if;

  v_total := round(
    p_principal + (p_principal * p_interest_rate / 100),
    2
  )::numeric(12,2);
  v_base_installment := round(v_total / p_installment_count, 2)::numeric(12,2);
  v_installment_amount := (
    v_total - (v_base_installment * (p_installment_count - 1))
  )::numeric(12,2);

  if v_base_installment <= 0 or v_installment_amount <= 0 then
    raise exception 'Installment amounts must be greater than zero'
      using errcode = '22023';
  end if;

  insert into public.customers (
    document_number,
    full_name,
    phone,
    address,
    notes,
    collector_id,
    active,
    created_by
  )
  values (
    btrim(p_document_number),
    btrim(p_full_name),
    nullif(btrim(p_phone), ''),
    btrim(p_address),
    nullif(btrim(p_notes), ''),
    v_actor,
    true,
    v_actor
  )
  returning public.customers.id into v_customer_id;

  insert into public.loans (
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
    v_customer_id,
    p_principal::numeric(12,2),
    p_interest_rate::numeric(7,4),
    v_total,
    p_principal::numeric(12,2),
    p_installment_count::smallint,
    p_frequency,
    p_started_on,
    v_first_due_on,
    'active'::public.loan_status,
    v_actor
  )
  returning public.loans.id into v_loan_id;

  v_due_date := v_first_due_on;

  for v_installment_number in 1..p_installment_count loop
    if v_installment_number = p_installment_count then
      v_installment_amount := (
        v_total - (v_base_installment * (p_installment_count - 1))
      )::numeric(12,2);
    else
      v_installment_amount := v_base_installment;
    end if;

    insert into public.installments (
      loan_id,
      installment_number,
      due_date,
      scheduled_amount
    )
    values (
      v_loan_id,
      v_installment_number::smallint,
      v_due_date,
      v_installment_amount
    );

    if p_frequency = 'daily'::public.loan_frequency then
      v_due_date := v_due_date + 1;
      while extract(isodow from v_due_date) = 7 loop
        v_due_date := v_due_date + 1;
      end loop;
    elsif p_frequency = 'weekly'::public.loan_frequency then
      v_due_date := v_due_date + 7;
    elsif p_frequency = 'monthly'::public.loan_frequency then
      v_due_date := (
        v_first_due_on + make_interval(months => v_installment_number)
      )::date;
    end if;
  end loop;

  insert into public.cash_movements (
    collector_id,
    customer_id,
    loan_id,
    direction,
    movement_type,
    amount,
    occurred_at,
    business_date,
    notes,
    created_by
  )
  values (
    v_actor,
    v_customer_id,
    v_loan_id,
    'outflow'::public.cash_direction,
    'loan_disbursement',
    p_principal::numeric(12,2),
    now(),
    (now() at time zone 'America/Lima')::date,
    'Desembolso de préstamo',
    v_actor
  );

  return query
  select
    v_customer_id,
    v_loan_id,
    v_total,
    v_base_installment,
    v_installment_amount,
    v_first_due_on;
end;
$$;


create or replace function public.collector_list_portfolio(
  p_business_date date default ((now() at time zone 'America/Lima')::date)
)
returns table (
  customer_id uuid,
  document_number text,
  full_name text,
  phone text,
  address text,
  notes text,
  loan_id uuid,
  principal_amount numeric(12,2),
  interest_rate_percent numeric(7,4),
  total_amount numeric(12,2),
  installment_count smallint,
  frequency public.loan_frequency,
  started_on date,
  first_due_on date,
  loan_status public.loan_status,
  remaining_balance numeric(12,2),
  installment_amount numeric(12,2),
  today_scheduled_amount numeric(12,2),
  today_outstanding_amount numeric(12,2),
  today_collected_amount numeric(12,2),
  overdue_days integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required' using errcode = '22023';
  end if;

  if (select private.current_app_role()) is distinct from 'collector'::public.app_role then
    raise exception 'Only active collectors may list a portfolio'
      using errcode = '42501';
  end if;

  return query
  with posted_payments as (
    select
      p.loan_id,
      coalesce(sum(p.amount), 0)::numeric(12,2) as paid_total,
      coalesce(sum(p.amount) filter (where p.business_date = p_business_date), 0)::numeric(12,2)
        as collected_today
    from public.payments p
    where p.status = 'posted'::public.payment_status
    group by p.loan_id
  ),
  schedule as (
    select
      ib.loan_id,
      coalesce(min(ib.scheduled_amount) filter (where ib.installment_number = 1), 0)::numeric(12,2)
        as installment_amount,
      coalesce(sum(ib.scheduled_amount) filter (where ib.due_date = p_business_date), 0)::numeric(12,2)
        as scheduled_today,
      coalesce(sum(ib.outstanding_amount) filter (where ib.due_date = p_business_date), 0)::numeric(12,2)
        as outstanding_today,
      coalesce(max(ib.overdue_days), 0)::integer as max_overdue_days
    from public.installment_balances ib
    group by ib.loan_id
  )
  select
    c.id,
    c.document_number,
    c.full_name,
    c.phone,
    c.address,
    c.notes,
    l.id,
    l.principal_amount,
    l.interest_rate_percent,
    l.total_amount,
    l.installment_count,
    l.frequency,
    l.started_on,
    l.first_due_on,
    l.status,
    case
      when l.id is null then 0
      else greatest(l.total_amount - coalesce(pp.paid_total, 0), 0)
    end::numeric(12,2),
    coalesce(s.installment_amount, 0)::numeric(12,2),
    coalesce(s.scheduled_today, 0)::numeric(12,2),
    coalesce(s.outstanding_today, 0)::numeric(12,2),
    coalesce(pp.collected_today, 0)::numeric(12,2),
    coalesce(s.max_overdue_days, 0)::integer
  from public.customers c
  left join public.loans l
    on l.customer_id = c.id
    and l.status = 'active'::public.loan_status
  left join posted_payments pp on pp.loan_id = l.id
  left join schedule s on s.loan_id = l.id
  where c.active = true
    and c.collector_id = v_actor
  order by
    coalesce(s.max_overdue_days, 0) desc,
    c.full_name,
    c.id;
end;
$$;


revoke execute
on function public.collector_create_customer_loan(
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  public.loan_frequency,
  integer,
  date
)
from public, anon;

grant execute
on function public.collector_create_customer_loan(
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  public.loan_frequency,
  integer,
  date
)
to authenticated;

revoke execute
on function public.collector_list_portfolio(date)
from public, anon;

grant execute
on function public.collector_list_portfolio(date)
to authenticated;
