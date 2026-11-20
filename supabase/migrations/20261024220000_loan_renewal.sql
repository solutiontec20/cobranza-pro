-- ============================================================
-- COBRANZAPRO - LOAN RENEWAL
--
-- Confirmed business rules (AGENTS.md / REQUERIMIENTO.md):
--   - One active loan per customer at a time (already enforced by
--     loans_one_active_per_customer_idx).
--   - A renewal closes the previous loan and creates a new one linked
--     to it (previous_loan_id), carrying over any outstanding balance
--     into the new loan's principal.
--   - New loans (including renewals) can be created by admin,
--     supervisor and collector.
--   - A blacklisted client (more than 5 days of accumulated overdue)
--     cannot renew their loan. Clients that are up to date, mildly
--     overdue (<=5 days) or already fully paid off CAN renew.
-- ============================================================

create or replace function public.renew_loan(
  p_loan_id uuid,
  p_principal numeric,
  p_interest_rate numeric,
  p_frequency public.loan_frequency,
  p_installment_count integer,
  p_started_on date
)
returns table (
  loan_id uuid,
  customer_id uuid,
  previous_loan_id uuid,
  total_amount numeric(12,2),
  disbursed_amount numeric(12,2),
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
  v_role public.app_role;

  v_customer_id uuid;
  v_old_status public.loan_status;
  v_collector_id uuid;
  v_customer_active boolean;

  v_overdue_days integer;
  v_old_outstanding numeric(12,2);

  v_new_loan_id uuid;
  v_total numeric(12,2);
  v_base_installment numeric(12,2);
  v_installment_amount numeric(12,2);
  v_disbursed numeric(12,2);

  v_first_due_on date;
  v_due_date date;
  v_installment_number integer;
begin

  -- ==========================================================
  -- AUTHENTICATION
  -- ==========================================================

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

  -- ==========================================================
  -- LOCK PREVIOUS LOAN + CUSTOMER
  -- ==========================================================

  select
    l.customer_id,
    l.status
  into
    v_customer_id,
    v_old_status
  from public.loans l
  where l.id = p_loan_id
  for update;

  if not found then
    raise exception 'Loan not found'
      using errcode = '22023';
  end if;

  select
    c.collector_id,
    c.active
  into
    v_collector_id,
    v_customer_active
  from public.customers c
  where c.id = v_customer_id
  for update;

  if not found then
    raise exception 'Customer not found'
      using errcode = '22023';
  end if;

  -- ==========================================================
  -- AUTHORIZATION
  -- ==========================================================

  if v_role = 'collector'::public.app_role then

    if v_collector_id <> v_actor then
      raise exception 'Collector cannot renew loans for another portfolio'
        using errcode = '42501';
    end if;

  elsif v_role not in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  ) then

    raise exception 'Insufficient privileges'
      using errcode = '42501';

  end if;

  if not v_customer_active then
    raise exception 'Cannot renew a loan for an inactive customer'
      using errcode = '22023';
  end if;

  -- ==========================================================
  -- BUSINESS RULES: eligible loan status + blacklist
  -- ==========================================================

  if v_old_status not in ('active'::public.loan_status, 'paid'::public.loan_status) then
    raise exception 'Only active or fully paid loans can be renewed'
      using errcode = '22023';
  end if;

  select coalesce(max(ib.overdue_days), 0)
    into v_overdue_days
  from public.installment_balances ib
  where ib.loan_id = p_loan_id;

  if v_overdue_days > 5 then
    raise exception 'Blacklisted customers cannot renew their loan'
      using errcode = '22023';
  end if;

  select private.loan_outstanding(p_loan_id)
    into v_old_outstanding;

  -- ==========================================================
  -- INPUT VALIDATION
  -- ==========================================================

  if p_principal is null or p_principal <= 0 then
    raise exception 'Principal must be greater than zero'
      using errcode = '22023';
  end if;

  if p_principal <> round(p_principal, 2) then
    raise exception 'Principal may contain at most two decimals'
      using errcode = '22023';
  end if;

  if p_principal < v_old_outstanding then
    raise exception 'Principal must be at least the outstanding balance of the previous loan'
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

  -- ==========================================================
  -- CALCULATIONS
  -- ==========================================================

  v_disbursed := (p_principal - v_old_outstanding)::numeric(12,2);

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

  -- ==========================================================
  -- CLOSE PREVIOUS LOAN
  -- ==========================================================

  update public.loans
  set
    status = 'renewed'::public.loan_status,
    closed_at = now(),
    close_reason = 'renewed'
  where id = p_loan_id;

  -- ==========================================================
  -- CREATE NEW LOAN + SCHEDULE
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
    v_customer_id,
    p_loan_id,
    p_principal::numeric(12,2),
    p_interest_rate::numeric(7,4),
    v_total,
    v_disbursed,
    p_installment_count::smallint,
    p_frequency,
    p_started_on,
    v_first_due_on,
    'active'::public.loan_status,
    v_actor
  )
  returning public.loans.id into v_new_loan_id;

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
      v_new_loan_id,
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

  -- ==========================================================
  -- CASH MOVEMENT (only when cash actually changes hands)
  -- ==========================================================

  if v_disbursed > 0 then
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
      v_collector_id,
      v_customer_id,
      v_new_loan_id,
      'outflow'::public.cash_direction,
      'loan_disbursement',
      v_disbursed,
      now(),
      (now() at time zone 'America/Lima')::date,
      'Desembolso de renovación de préstamo',
      v_actor
    );
  end if;

  return query
  select
    v_new_loan_id,
    v_customer_id,
    p_loan_id,
    v_total,
    v_disbursed,
    v_base_installment,
    v_installment_amount,
    v_first_due_on;
end;
$$;


revoke execute
on function public.renew_loan(
  uuid,
  numeric,
  numeric,
  public.loan_frequency,
  integer,
  date
)
from public, anon;

grant execute
on function public.renew_loan(
  uuid,
  numeric,
  numeric,
  public.loan_frequency,
  integer,
  date
)
to authenticated;
