-- ============================================================
-- COBRANZAPRO - DAILY COLLECTIONS MONDAY THROUGH SATURDAY
-- ============================================================
-- New and replacement daily schedules skip Sunday only.
-- Existing schedules are intentionally preserved to avoid silently
-- changing agreed or historical due dates.
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

create or replace function public.admin_update_loan(
  p_loan_id uuid,
  p_principal numeric,
  p_interest_rate numeric,
  p_frequency public.loan_frequency,
  p_installment_count integer,
  p_started_on date,
  p_reason text
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
  v_reason text;

  v_status public.loan_status;
  v_old_principal numeric(12,2);
  v_old_installment_count smallint;

  v_total numeric(12,2);
  v_base_installment numeric(12,2);
  v_installment_amount numeric(12,2);
  v_first_due_on date;
  v_due_date date;
  v_active_installment_count integer;

  v_disbursement_count integer;
  v_disbursement_id uuid;
  v_disbursement_collector_id uuid;
  v_disbursement_business_date date;
  v_superseded_at timestamptz;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select private.current_app_role()
  into v_role;

  if v_role is distinct from 'admin'::public.app_role then
    raise exception 'Only administrators may update loans'
      using errcode = '42501';
  end if;

  if p_loan_id is null then
    raise exception 'Loan is required'
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

  v_reason := nullif(btrim(p_reason), '');

  if v_reason is null then
    raise exception 'Update reason is required'
      using errcode = '22023';
  end if;

  select
    l.status,
    l.principal_amount,
    l.installment_count
  into
    v_status,
    v_old_principal,
    v_old_installment_count
  from public.loans l
  where l.id = p_loan_id
  for update;

  if not found then
    raise exception 'Loan not found'
      using errcode = '22023';
  end if;

  if v_status <> 'active'::public.loan_status then
    raise exception 'Only active loans may be updated'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.payments p
    where p.loan_id = p_loan_id
  ) then
    raise exception 'Loans with payment history cannot be updated'
      using errcode = '22023';
  end if;

  v_first_due_on := p_started_on;

  if p_frequency = 'daily'::public.loan_frequency then
    while extract(isodow from v_first_due_on) = 7
    loop
      v_first_due_on := v_first_due_on + 1;
    end loop;
  end if;

  v_total := round(
    p_principal + (p_principal * p_interest_rate / 100),
    2
  )::numeric(12,2);

  v_base_installment := round(
    v_total / p_installment_count,
    2
  )::numeric(12,2);

  v_installment_amount := (
    v_total - (v_base_installment * (p_installment_count - 1))
  )::numeric(12,2);

  if v_base_installment <= 0 or v_installment_amount <= 0 then
    raise exception 'Installment amounts must be greater than zero'
      using errcode = '22023';
  end if;

  perform i.id
  from public.installments i
  where i.loan_id = p_loan_id
    and i.superseded_at is null
  for update;

  select count(*)::integer
  into v_active_installment_count
  from public.installments i
  where i.loan_id = p_loan_id
    and i.superseded_at is null;

  if v_active_installment_count <> v_old_installment_count then
    raise exception 'Loan active schedule is inconsistent'
      using errcode = '22023';
  end if;

  if p_principal::numeric(12,2) <> v_old_principal then
    select count(*)::integer
    into v_disbursement_count
    from public.cash_movements cm
    where cm.loan_id = p_loan_id
      and cm.direction = 'outflow'::public.cash_direction
      and cm.movement_type = 'loan_disbursement';

    if v_disbursement_count <> 1 then
      raise exception 'Loan disbursement cash movement is inconsistent'
        using errcode = '22023';
    end if;

    select
      cm.id,
      cm.collector_id,
      cm.business_date
    into
      v_disbursement_id,
      v_disbursement_collector_id,
      v_disbursement_business_date
    from public.cash_movements cm
    where cm.loan_id = p_loan_id
      and cm.direction = 'outflow'::public.cash_direction
      and cm.movement_type = 'loan_disbursement'
    for update;

    perform cc.id
    from public.cash_closures cc
    where cc.collector_id = v_disbursement_collector_id
      and cc.business_date = v_disbursement_business_date
    for update;

    if found then
      raise exception 'Principal cannot change after its cash closure exists'
        using errcode = '22023';
    end if;
  end if;

  perform set_config('app.audit_reason', v_reason, true);
  v_superseded_at := clock_timestamp();

  update public.installments
  set
    superseded_at = v_superseded_at,
    superseded_by = v_actor,
    supersession_reason = v_reason
  where loan_id = p_loan_id
    and superseded_at is null;

  update public.loans
  set
    principal_amount = p_principal::numeric(12,2),
    interest_rate_percent = p_interest_rate::numeric(7,4),
    total_amount = v_total,
    disbursed_amount = p_principal::numeric(12,2),
    installment_count = p_installment_count::smallint,
    frequency = p_frequency,
    started_on = p_started_on,
    first_due_on = v_first_due_on
  where public.loans.id = p_loan_id;

  v_due_date := v_first_due_on;

  for v_installment_number in 1..p_installment_count
  loop
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
      p_loan_id,
      v_installment_number::smallint,
      v_due_date,
      v_installment_amount
    );

    if p_frequency = 'daily'::public.loan_frequency then
      v_due_date := v_due_date + 1;

      while extract(isodow from v_due_date) = 7
      loop
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

  if v_disbursement_id is not null then
    update public.cash_movements
    set amount = p_principal::numeric(12,2)
    where public.cash_movements.id = v_disbursement_id;
  end if;

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
  where l.id = p_loan_id;
end;
$$;
