-- Analytics RPCs: an exact date range (not a fixed window), an optional collector filter, a
-- per-collector breakdown and an expense breakdown by category.
--
-- All three are read-only, SECURITY INVOKER (existing RLS still applies), restricted to
-- admin/supervisor, with an empty search_path. Every amount is a FLOW: movements whose Lima
-- business date falls inside the requested range. Rules match admin_dashboard_financial_series:
--   * collections: posted payments only, current (non-superseded) allocations only;
--   * interest: allocation amount * (total - principal) / total of the loan;
--   * disbursements: loan_disbursement outflows net of loan_void inflows;
--   * expenses: approved cash_expenses only (an allowance is a cash inflow, never an expense);
--   * net profit: interest collected minus approved expenses.
--
-- Rollback: drop the three functions; nothing else depends on them.


create or replace function public.admin_analytics_series(
  p_start date,
  p_end date,
  p_bucket text,
  p_collector_id uuid default null
)
returns table (
  bucket_start date,
  bucket_end date,
  collected_amount numeric(12,2),
  interest_collected numeric(12,2),
  loan_disbursements numeric(12,2),
  operating_expenses numeric(12,2),
  net_profit numeric(12,2),
  payments_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_first date;
  v_step interval;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;
  if v_role is null then
    raise exception 'Active application profile required' using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view analytics'
      using errcode = '42501';
  end if;

  if p_start is null or p_end is null then
    raise exception 'Start and end dates are required' using errcode = '22023';
  end if;

  if p_end < p_start then
    raise exception 'End date must not precede start date' using errcode = '22023';
  end if;

  if p_end - p_start > 3660 then
    raise exception 'Date range is too large' using errcode = '22023';
  end if;

  case p_bucket
    when 'day' then
      if p_end - p_start > 400 then
        raise exception 'Too many daily buckets for the requested range'
          using errcode = '22023';
      end if;
      v_first := p_start;
      v_step := interval '1 day';
    when 'week' then
      v_first := date_trunc('week', p_start::timestamp)::date;
      v_step := interval '1 week';
    when 'month' then
      v_first := date_trunc('month', p_start::timestamp)::date;
      v_step := interval '1 month';
    when 'year' then
      v_first := date_trunc('year', p_start::timestamp)::date;
      v_step := interval '1 year';
    else
      raise exception 'Unsupported analytics bucket' using errcode = '22023';
  end case;

  return query
  with buckets as (
    select
      greatest(g.start_ts::date, p_start) as b_start,
      least((g.start_ts + v_step - interval '1 day')::date, p_end) as b_end
    from generate_series(v_first::timestamp, p_end::timestamp, v_step) as g(start_ts)
  ), payment_totals as (
    select
      p.business_date as activity_date,
      sum(pa.amount) as collected,
      sum(
        pa.amount * (l.total_amount - l.principal_amount) / nullif(l.total_amount, 0)
      ) as interest,
      count(distinct p.id) as pay_count
    from public.payments p
    join public.payment_allocations pa on pa.payment_id = p.id
    join public.loans l on l.id = p.loan_id
    where p.status = 'posted'::public.payment_status
      and pa.superseded_at is null
      and p.business_date between p_start and p_end
      and (p_collector_id is null or p.collector_id = p_collector_id)
    group by p.business_date
  ), disbursement_totals as (
    select
      cm.business_date as activity_date,
      sum(
        case
          when cm.movement_type = 'loan_disbursement'
            and cm.direction = 'outflow'::public.cash_direction then cm.amount
          when cm.movement_type = 'loan_void'
            and cm.direction = 'inflow'::public.cash_direction then -cm.amount
          else 0
        end
      ) as disbursed
    from public.cash_movements cm
    where cm.business_date between p_start and p_end
      and (p_collector_id is null or cm.collector_id = p_collector_id)
      and (
        (cm.movement_type = 'loan_disbursement'
          and cm.direction = 'outflow'::public.cash_direction)
        or (cm.movement_type = 'loan_void'
          and cm.direction = 'inflow'::public.cash_direction)
      )
    group by cm.business_date
  ), expense_totals as (
    select
      cm.business_date as activity_date,
      sum(cm.amount) as spent
    from public.cash_expenses ce
    join public.cash_movements cm on cm.id = ce.cash_movement_id
    where ce.status = 'approved'::public.cash_expense_status
      and cm.movement_type = 'operating_expense'
      and cm.direction = 'outflow'::public.cash_direction
      and cm.business_date between p_start and p_end
      and (p_collector_id is null or ce.collector_id = p_collector_id)
    group by cm.business_date
  )
  select
    b.b_start,
    b.b_end,
    coalesce((
      select sum(pt.collected)
      from payment_totals pt
      where pt.activity_date between b.b_start and b.b_end
    ), 0)::numeric(12,2),
    coalesce((
      select sum(pt.interest)
      from payment_totals pt
      where pt.activity_date between b.b_start and b.b_end
    ), 0)::numeric(12,2),
    coalesce((
      select sum(dt.disbursed)
      from disbursement_totals dt
      where dt.activity_date between b.b_start and b.b_end
    ), 0)::numeric(12,2),
    coalesce((
      select sum(et.spent)
      from expense_totals et
      where et.activity_date between b.b_start and b.b_end
    ), 0)::numeric(12,2),
    (
      coalesce((
        select sum(pt.interest)
        from payment_totals pt
        where pt.activity_date between b.b_start and b.b_end
      ), 0)
      - coalesce((
        select sum(et.spent)
        from expense_totals et
        where et.activity_date between b.b_start and b.b_end
      ), 0)
    )::numeric(12,2),
    coalesce((
      select sum(pt.pay_count)
      from payment_totals pt
      where pt.activity_date between b.b_start and b.b_end
    ), 0)::integer
  from buckets b
  order by b.b_start;
end;
$$;

revoke all on function public.admin_analytics_series(date, date, text, uuid) from public, anon;
grant execute on function public.admin_analytics_series(date, date, text, uuid) to authenticated;


create or replace function public.admin_analytics_collectors(
  p_start date,
  p_end date
)
returns table (
  collector_id uuid,
  collector_name text,
  collector_dni text,
  collected_amount numeric(12,2),
  interest_collected numeric(12,2),
  payments_count integer,
  clients_attended integer,
  loan_disbursements numeric(12,2),
  operating_expenses numeric(12,2),
  net_profit numeric(12,2)
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;
  if v_role is null then
    raise exception 'Active application profile required' using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view analytics'
      using errcode = '42501';
  end if;

  if p_start is null or p_end is null then
    raise exception 'Start and end dates are required' using errcode = '22023';
  end if;

  if p_end < p_start then
    raise exception 'End date must not precede start date' using errcode = '22023';
  end if;

  if p_end - p_start > 3660 then
    raise exception 'Date range is too large' using errcode = '22023';
  end if;

  return query
  with pay as (
    select
      p.collector_id as cid,
      sum(pa.amount) as collected,
      sum(
        pa.amount * (l.total_amount - l.principal_amount) / nullif(l.total_amount, 0)
      ) as interest,
      count(distinct p.id) as pay_count,
      count(distinct l.customer_id) as clients
    from public.payments p
    join public.payment_allocations pa on pa.payment_id = p.id
    join public.loans l on l.id = p.loan_id
    where p.status = 'posted'::public.payment_status
      and pa.superseded_at is null
      and p.business_date between p_start and p_end
    group by p.collector_id
  ), disb as (
    select
      cm.collector_id as cid,
      sum(
        case
          when cm.movement_type = 'loan_disbursement'
            and cm.direction = 'outflow'::public.cash_direction then cm.amount
          when cm.movement_type = 'loan_void'
            and cm.direction = 'inflow'::public.cash_direction then -cm.amount
          else 0
        end
      ) as disbursed
    from public.cash_movements cm
    where cm.business_date between p_start and p_end
      and (
        (cm.movement_type = 'loan_disbursement'
          and cm.direction = 'outflow'::public.cash_direction)
        or (cm.movement_type = 'loan_void'
          and cm.direction = 'inflow'::public.cash_direction)
      )
    group by cm.collector_id
  ), spent as (
    select
      ce.collector_id as cid,
      sum(cm.amount) as total_spent
    from public.cash_expenses ce
    join public.cash_movements cm on cm.id = ce.cash_movement_id
    where ce.status = 'approved'::public.cash_expense_status
      and cm.movement_type = 'operating_expense'
      and cm.direction = 'outflow'::public.cash_direction
      and cm.business_date between p_start and p_end
    group by ce.collector_id
  )
  select
    pr.id,
    pr.full_name,
    pr.dni,
    coalesce(pay.collected, 0)::numeric(12,2),
    coalesce(pay.interest, 0)::numeric(12,2),
    coalesce(pay.pay_count, 0)::integer,
    coalesce(pay.clients, 0)::integer,
    coalesce(disb.disbursed, 0)::numeric(12,2),
    coalesce(spent.total_spent, 0)::numeric(12,2),
    (coalesce(pay.interest, 0) - coalesce(spent.total_spent, 0))::numeric(12,2)
  from public.profiles pr
  left join pay on pay.cid = pr.id
  left join disb on disb.cid = pr.id
  left join spent on spent.cid = pr.id
  where pr.role = 'collector'::public.app_role
    and (
      pr.active
      or pay.cid is not null
      or disb.cid is not null
      or spent.cid is not null
    )
  order by coalesce(pay.collected, 0) desc, pr.full_name asc;
end;
$$;

revoke all on function public.admin_analytics_collectors(date, date) from public, anon;
grant execute on function public.admin_analytics_collectors(date, date) to authenticated;


create or replace function public.admin_analytics_expense_categories(
  p_start date,
  p_end date,
  p_collector_id uuid default null
)
returns table (
  category public.cash_expense_category,
  expense_count integer,
  spent_amount numeric(12,2)
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;
  if v_role is null then
    raise exception 'Active application profile required' using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view analytics'
      using errcode = '42501';
  end if;

  if p_start is null or p_end is null then
    raise exception 'Start and end dates are required' using errcode = '22023';
  end if;

  if p_end < p_start then
    raise exception 'End date must not precede start date' using errcode = '22023';
  end if;

  if p_end - p_start > 3660 then
    raise exception 'Date range is too large' using errcode = '22023';
  end if;

  return query
  select
    ce.category,
    count(*)::integer,
    sum(cm.amount)::numeric(12,2)
  from public.cash_expenses ce
  join public.cash_movements cm on cm.id = ce.cash_movement_id
  where ce.status = 'approved'::public.cash_expense_status
    and cm.movement_type = 'operating_expense'
    and cm.direction = 'outflow'::public.cash_direction
    and cm.business_date between p_start and p_end
    and (p_collector_id is null or ce.collector_id = p_collector_id)
  group by ce.category
  order by sum(cm.amount) desc, ce.category;
end;
$$;

revoke all on function public.admin_analytics_expense_categories(date, date, uuid)
  from public, anon;
grant execute on function public.admin_analytics_expense_categories(date, date, uuid)
  to authenticated;
