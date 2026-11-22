-- One read-only, admin-scoped financial series for the dashboard charts.
-- Payment and cash movement business_date values are already assigned using
-- America/Lima by their write RPCs; the reference date is a business date too.
create or replace function public.admin_dashboard_financial_series(
  p_granularity text,
  p_reference_date date
)
returns table (
  bucket_start date,
  bucket_end date,
  collected_amount numeric(12,2),
  interest_collected numeric(12,2),
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
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_first_bucket date;
  v_last_bucket date;
  v_step interval;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;
  if v_role is null then
    raise exception 'Active application profile required' using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view dashboard financial series'
      using errcode = '42501';
  end if;

  if p_reference_date is null then
    raise exception 'Reference date is required' using errcode = '22023';
  end if;

  case p_granularity
    when 'daily' then
      v_first_bucket := date_trunc('month', p_reference_date::timestamp)::date;
      v_last_bucket := (v_first_bucket + interval '1 month - 1 day')::date;
      v_step := interval '1 day';
    when 'weekly' then
      v_last_bucket := date_trunc('week', p_reference_date::timestamp)::date;
      v_first_bucket := (v_last_bucket - interval '11 weeks')::date;
      v_step := interval '1 week';
    when 'monthly' then
      v_last_bucket := date_trunc('month', p_reference_date::timestamp)::date;
      v_first_bucket := (v_last_bucket - interval '11 months')::date;
      v_step := interval '1 month';
    when 'annual' then
      v_last_bucket := date_trunc('year', p_reference_date::timestamp)::date;
      v_first_bucket := (v_last_bucket - interval '4 years')::date;
      v_step := interval '1 year';
    else
      raise exception 'Unsupported financial series granularity'
        using errcode = '22023';
  end case;

  return query
  with buckets as (
    select
      generated.bucket_start::date as bucket_start,
      case p_granularity
        when 'daily' then generated.bucket_start::date
        when 'weekly' then (generated.bucket_start + interval '1 week - 1 day')::date
        when 'monthly' then (generated.bucket_start + interval '1 month - 1 day')::date
        else (generated.bucket_start + interval '1 year - 1 day')::date
      end as bucket_end
    from generate_series(v_first_bucket::timestamp, v_last_bucket::timestamp, v_step)
      as generated(bucket_start)
  ), payment_totals as (
    select
      p.business_date as activity_date,
      sum(pa.amount)::numeric(12,2) as collected_amount,
      sum(
        pa.amount * (l.total_amount - l.principal_amount) / nullif(l.total_amount, 0)
      )::numeric(12,2) as interest_collected
    from public.payments p
    join public.payment_allocations pa on pa.payment_id = p.id
    join public.loans l on l.id = p.loan_id
    where p.status = 'posted'::public.payment_status
      and pa.superseded_at is null
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
      )::numeric(12,2) as amount
    from public.cash_movements cm
    where (cm.movement_type = 'loan_disbursement'
        and cm.direction = 'outflow'::public.cash_direction)
      or (cm.movement_type = 'loan_void'
        and cm.direction = 'inflow'::public.cash_direction)
    group by cm.business_date
  ), approved_expense_totals as (
    select
      cm.business_date as activity_date,
      sum(cm.amount)::numeric(12,2) as amount
    from public.cash_expenses ce
    join public.cash_movements cm on cm.id = ce.cash_movement_id
    where ce.status = 'approved'::public.cash_expense_status
      and cm.movement_type = 'operating_expense'
      and cm.direction = 'outflow'::public.cash_direction
    group by cm.business_date
  )
  select
    b.bucket_start,
    b.bucket_end,
    coalesce((
      select sum(pt.collected_amount)
      from payment_totals pt
      where pt.activity_date between b.bucket_start and b.bucket_end
    ), 0)::numeric(12,2),
    coalesce((
      select sum(pt.interest_collected)
      from payment_totals pt
      where pt.activity_date between b.bucket_start and b.bucket_end
    ), 0)::numeric(12,2),
    coalesce((
      select sum(dt.amount)
      from disbursement_totals dt
      where dt.activity_date between b.bucket_start and b.bucket_end
    ), 0)::numeric(12,2),
    coalesce((
      select sum(et.amount)
      from approved_expense_totals et
      where et.activity_date between b.bucket_start and b.bucket_end
    ), 0)::numeric(12,2),
    (
      coalesce((
        select sum(pt.interest_collected)
        from payment_totals pt
        where pt.activity_date between b.bucket_start and b.bucket_end
      ), 0)
      - coalesce((
        select sum(et.amount)
        from approved_expense_totals et
        where et.activity_date between b.bucket_start and b.bucket_end
      ), 0)
    )::numeric(12,2)
  from buckets b
  order by b.bucket_start;
end;
$$;

revoke all on function public.admin_dashboard_financial_series(text, date) from public, anon;
grant execute on function public.admin_dashboard_financial_series(text, date) to authenticated;
