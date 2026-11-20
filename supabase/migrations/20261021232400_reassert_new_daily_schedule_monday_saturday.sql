-- ============================================================
-- COBRANZAPRO - REASSERT NEW DAILY SCHEDULE MONDAY-SATURDAY
-- ============================================================
-- Replaces the creation RPC under a new migration version so environments
-- that retained the legacy Monday-Friday implementation receive the fix.
-- Daily schedules accept Saturday and skip Sunday only.
-- ============================================================

create or replace function public.admin_create_loan(
  p_customer_id uuid,
  p_principal numeric,
  p_interest_rate numeric,
  p_frequency public.loan_frequency,
  p_installment_count integer,
  p_started_on date,
  p_first_due_on date
)
returns table (
  id uuid,
  customer_id uuid,
  principal_amount numeric(12,2),
  interest_rate_percent numeric(7,4),
  total_amount numeric(12,2),
  disbursed_amount numeric(12,2),
  installment_count smallint,
  frequency public.loan_frequency,
  started_on date,
  first_due_on date,
  status public.loan_status,
  created_at timestamptz
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
  v_customer_active boolean;

  v_loan_id uuid;

  v_total numeric(12,2);
  v_base_installment numeric(12,2);
  v_installment_amount numeric(12,2);

  v_due_date date;
  v_first_due_on date;
begin

  -- ==========================================================
  -- AUTHENTICATION
  -- ==========================================================

  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select private.current_app_role()
  into v_role;


  if v_role is distinct from 'admin'::public.app_role then
    raise exception 'Only administrators may create loans'
      using errcode = '42501';
  end if;


  -- ==========================================================
  -- INPUT VALIDATION
  -- ==========================================================

  if p_customer_id is null then
    raise exception 'Customer is required'
      using errcode = '22023';
  end if;


  if p_principal is null or p_principal <= 0 then
    raise exception 'Principal must be greater than zero'
      using errcode = '22023';
  end if;


  if p_principal <> round(p_principal, 2) then
    raise exception 'Principal may contain at most two decimals'
      using errcode = '22023';
  end if;


  if p_interest_rate is null or p_interest_rate < 0 then
    raise exception 'Interest rate cannot be negative'
      using errcode = '22023';
  end if;


  if p_interest_rate <> round(p_interest_rate, 4) then
    raise exception 'Interest rate may contain at most four decimals'
      using errcode = '22023';
  end if;


  if p_frequency is null then
    raise exception 'Loan frequency is required'
      using errcode = '22023';
  end if;


  if p_installment_count is null
     or p_installment_count <= 0
     or p_installment_count > 32767
  then
    raise exception 'Invalid installment count'
      using errcode = '22023';
  end if;


  if p_started_on is null then
    raise exception 'Loan start date is required'
      using errcode = '22023';
  end if;


  if p_first_due_on is null then
    raise exception 'First due date is required'
      using errcode = '22023';
  end if;


  if p_first_due_on < p_started_on then
    raise exception 'First due date cannot be before loan start date'
      using errcode = '22023';
  end if;

  v_first_due_on := p_first_due_on;

  if p_frequency = 'daily'::public.loan_frequency then
    while extract(isodow from v_first_due_on) = 7
    loop
      v_first_due_on := v_first_due_on + 1;
    end loop;
  end if;


  -- ==========================================================
  -- CUSTOMER
  --
  -- Lock customer so its collector assignment cannot change
  -- during loan creation.
  -- ==========================================================

  select
    c.collector_id,
    c.active
  into
    v_collector_id,
    v_customer_active
  from public.customers c
  where c.id = p_customer_id
  for update;


  if not found then
    raise exception 'Customer not found'
      using errcode = '22023';
  end if;


  if not v_customer_active then
    raise exception 'Cannot create a loan for an inactive customer'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- ACTIVE LOAN CHECK
  -- ==========================================================

  if exists (
    select 1
    from public.loans l
    where l.customer_id = p_customer_id
      and l.status = 'active'::public.loan_status
  ) then
    raise exception 'Customer already has an active loan'
      using errcode = '23505';
  end if;


  -- ==========================================================
  -- FINANCIAL CALCULATION
  -- ==========================================================

  v_total :=
    round(
      p_principal
      + (
          p_principal
          * p_interest_rate
          / 100
        ),
      2
    )::numeric(12,2);


  v_base_installment :=
    round(
      v_total / p_installment_count,
      2
    )::numeric(12,2);

  v_installment_amount :=
    (
      v_total
      -
      (
        v_base_installment
        * (p_installment_count - 1)
      )
    )::numeric(12,2);

  if v_base_installment <= 0 or v_installment_amount <= 0 then
    raise exception 'Installment amounts must be greater than zero'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- CREATE LOAN
  -- ==========================================================

  insert into public.loans (
    customer_id,
    previous_loan_id,
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
    p_customer_id,
    null,
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
  returning public.loans.id
  into v_loan_id;


  -- ==========================================================
  -- GENERATE INSTALLMENTS
  -- ==========================================================

  v_due_date := v_first_due_on;


  for v_installment_number
  in 1..p_installment_count
  loop

    -- The last installment absorbs rounding differences.
    if v_installment_number = p_installment_count then

      v_installment_amount :=
        (
          v_total
          -
          (
            v_base_installment
            * (p_installment_count - 1)
          )
        )::numeric(12,2);

    else

      v_installment_amount :=
        v_base_installment;

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


    -- --------------------------------------------------------
    -- NEXT DUE DATE
    -- --------------------------------------------------------

    if p_frequency = 'daily'::public.loan_frequency then

      v_due_date := v_due_date + 1;

      -- Daily collections run Monday through Saturday; skip Sunday.
      while extract(isodow from v_due_date) = 7
      loop
        v_due_date := v_due_date + 1;
      end loop;


    elsif p_frequency = 'weekly'::public.loan_frequency then

      v_due_date := v_due_date + 7;


    elsif p_frequency = 'monthly'::public.loan_frequency then

      v_due_date :=
        (
          v_first_due_on
          +
          make_interval(
            months => v_installment_number
          )
        )::date;

    end if;

  end loop;


  -- ==========================================================
  -- CASH LEDGER
  --
  -- Money delivered to customer = cash outflow assigned to the
  -- customer's collector.
  -- ==========================================================

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
    notes,
    created_by
  )
  values (
    v_collector_id,
    p_customer_id,
    v_loan_id,
    null,
    'outflow'::public.cash_direction,
    'loan_disbursement',
    p_principal::numeric(12,2),
    null,
    now(),
    (now() at time zone 'America/Lima')::date,
    'Desembolso de préstamo',
    v_actor
  );


  -- ==========================================================
  -- RESULT
  -- ==========================================================

  return query

  select
    l.id,
    l.customer_id,
    l.principal_amount,
    l.interest_rate_percent,
    l.total_amount,
    l.disbursed_amount,
    l.installment_count,
    l.frequency,
    l.started_on,
    l.first_due_on,
    l.status,
    l.created_at

  from public.loans l
  where l.id = v_loan_id;

end;
$$;
